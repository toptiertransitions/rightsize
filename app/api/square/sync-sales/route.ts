import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getItemBySquareVariationId,
  getItemByBarcodeNumber,
  createItemSaleEvent,
  applySquareSaleToItem,
  getSaleEventBySquarePaymentId,
} from "@/lib/airtable";
import {
  listSquareCompletedPayments,
  getSquareOrder,
  getSquareCatalogObjectSku,
} from "@/lib/square";

// ─── GET: diagnostic dry-run (no writes) ──────────────────────────────────────

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId);
  if (!["TTTManager", "TTTAdmin"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10);
  const payments = await listSquareCompletedPayments(days).catch((e) => {
    return { error: String(e) };
  });

  if ("error" in payments) {
    return NextResponse.json({ ok: false, error: (payments as { error: string }).error });
  }

  const report = [];
  for (const payment of payments as Awaited<ReturnType<typeof listSquareCompletedPayments>>) {
    const existing = await getSaleEventBySquarePaymentId(payment.paymentId).catch(() => null);
    const lineItems = await getSquareOrder(payment.orderId).catch(() => []);

    const lineReport = [];
    for (const li of lineItems) {
      let item = li.catalogObjectId
        ? await getItemBySquareVariationId(li.catalogObjectId).catch(() => null)
        : null;
      let matchedBy = item ? "variationId" : null;

      // SKU fallback
      if (!item && li.catalogObjectId) {
        const sku = await getSquareCatalogObjectSku(li.catalogObjectId).catch(() => null);
        if (sku) {
          item = await getItemByBarcodeNumber(sku).catch(() => null);
          if (item) matchedBy = `sku:${sku}`;
        }
      }

      lineReport.push({
        name: li.name,
        catalogObjectId: li.catalogObjectId,
        quantity: li.quantity,
        priceCents: li.basePriceMoney.amount,
        itemFound: !!item,
        itemName: item?.itemName,
        itemStatus: item?.status,
        matchedBy,
      });
    }

    report.push({
      paymentId: payment.paymentId,
      orderId: payment.orderId,
      createdAt: payment.createdAt,
      alreadyProcessed: !!existing,
      lineItems: lineReport,
    });
  }

  return NextResponse.json({ days, paymentsFound: report.length, payments: report });
}

// ─── POST: process unhandled sales ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTManager", "TTTAdmin"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const days: number = body.days ?? 30;

  const paymentsOrError = await listSquareCompletedPayments(days).catch((e) => ({ error: String(e) }));
  if ("error" in paymentsOrError) {
    return NextResponse.json({
      processed: 0, skipped: 0,
      message: `Failed to reach Square API: ${(paymentsOrError as { error: string }).error}`,
    });
  }

  const payments = paymentsOrError as Awaited<ReturnType<typeof listSquareCompletedPayments>>;

  if (!payments.length) {
    return NextResponse.json({
      processed: 0, skipped: 0,
      message: `No completed payments found in Square for the last ${days} days.`,
    });
  }

  let processed = 0;
  let skipped = 0;
  const soldItems: string[] = [];
  const errors: string[] = [];
  const noMatchPayments: string[] = [];

  for (const payment of payments) {
    try {
      const existing = await getSaleEventBySquarePaymentId(payment.paymentId).catch(() => null);
      if (existing) {
        // Sale event exists — check if the item status is still wrong and fix it
        skipped++;
        continue;
      }

      const lineItems = await getSquareOrder(payment.orderId).catch(() => []);
      if (!lineItems.length) { skipped++; continue; }

      let anyMatched = false;

      for (const li of lineItems) {
        // Primary lookup: by Square variation ID
        let item = li.catalogObjectId
          ? await getItemBySquareVariationId(li.catalogObjectId).catch(() => null)
          : null;

        // Fallback: look up the catalog object SKU from Square, then match by barcode
        if (!item && li.catalogObjectId) {
          const sku = await getSquareCatalogObjectSku(li.catalogObjectId).catch(() => null);
          if (sku) {
            item = await getItemByBarcodeNumber(sku).catch(() => null);
          }
        }

        if (!item) continue;
        // Skip items already marked Sold — avoid double-counting manually-set status
        if (item.status === "Sold") continue;

        anyMatched = true;
        const unitPriceDollars = li.basePriceMoney.amount / 100;
        const totalAmount = unitPriceDollars * li.quantity;
        const clientSharePercent = item.clientSharePercent ?? 0;
        const clientPayout = totalAmount * (clientSharePercent / 100);

        await createItemSaleEvent({
          itemId: item.id,
          tenantId: item.tenantId,
          itemName: item.itemName,
          quantitySold: li.quantity,
          unitPrice: unitPriceDollars,
          totalAmount,
          clientPayout,
          squarePaymentId: payment.paymentId,
          squareOrderId: payment.orderId,
          saleDate: payment.createdAt,
          payoutPaid: false,
        });

        await applySquareSaleToItem({
          itemId: item.id,
          quantitySold: li.quantity,
          currentQuantity: item.quantity ?? 1,
          currentQuantitySold: item.quantitySold ?? 0,
          salePrice: unitPriceDollars,
          clientPayout,
        });

        soldItems.push(item.itemName);
      }

      if (anyMatched) processed++;
      else { skipped++; noMatchPayments.push(payment.paymentId); }
    } catch (e) {
      errors.push(`Payment ${payment.paymentId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const message = processed > 0
    ? `Marked ${processed} payment${processed !== 1 ? "s" : ""} as Sold: ${soldItems.join(", ")}.`
    : `No new sales matched. Checked ${payments.length} payment${payments.length !== 1 ? "s" : ""} (${skipped} already processed).${noMatchPayments.length > 0 ? ` ${noMatchPayments.length} had no matching inventory items.` : ""}`;

  return NextResponse.json({ processed, skipped, soldItems, noMatchPayments, errors, message });
}
