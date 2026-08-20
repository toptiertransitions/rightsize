export const runtime = "nodejs";

import { NextRequest, NextResponse, after } from "next/server";
import {
  getItemBySquareVariationId,
  createItemSaleEvent,
  applySquareSaleToItem,
  getSaleEventBySquarePaymentId,
  getTenantById,
  getStaffMembers,
} from "@/lib/airtable";
import { getAdminEmails } from "@/lib/admin-notifications";
import { validateSquareWebhookSignature, getSquareOrder } from "@/lib/square";
import { Resend } from "resend";
import { buildItemSoldEmail } from "@/lib/email";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-square-hmacsha256-signature") ?? "";
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? "";
  const webhookUrl =
    process.env.SQUARE_WEBHOOK_URL ??
    `https://${req.headers.get("host")}/api/square/webhook`;

  // Validate signature
  if (signatureKey) {
    const valid = validateSquareWebhookSignature({
      signatureKey,
      webhookUrl,
      body: rawBody,
      signature,
    });
    if (!valid) {
      console.warn(`[square/webhook] Invalid signature. URL used: ${webhookUrl}. Sig received: ${signature.slice(0, 20)}…`);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = event.type as string;
  console.log(`[square/webhook] event_type=${eventType}`);

  // Handle both payment.created and payment.updated with COMPLETED status
  if (eventType !== "payment.updated" && eventType !== "payment.created") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const payment = (event.data as Record<string, unknown>)?.object as Record<string, unknown> | undefined;
  const paymentObj = payment?.payment as Record<string, unknown> | undefined;

  console.log(`[square/webhook] payment_status=${paymentObj?.status} payment_id=${paymentObj?.id}`);

  if (!paymentObj || paymentObj.status !== "COMPLETED") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const paymentId = String(paymentObj.id ?? "");
  const orderId = String(paymentObj.order_id ?? "");
  const paymentDate = String(paymentObj.created_at ?? new Date().toISOString());

  console.log(`[square/webhook] paymentId=${paymentId} orderId=${orderId}`);

  if (!paymentId || !orderId) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    // Dedup — ignore if we already processed this payment
    const existing = await getSaleEventBySquarePaymentId(paymentId).catch(() => null);
    if (existing) {
      console.log(`[square/webhook] already processed paymentId=${paymentId}`);
      return NextResponse.json({ ok: true, skipped: true, reason: "already processed" });
    }

    // Fetch the order to get line items
    const lineItems = await getSquareOrder(orderId);
    console.log(`[square/webhook] lineItems=${lineItems.length} orderId=${orderId}`);

    if (!lineItems.length) {
      return NextResponse.json({ ok: true, skipped: true, reason: "no line items" });
    }

    let processed = 0;

    for (const li of lineItems) {
      console.log(`[square/webhook] line_item catalogObjectId=${li.catalogObjectId} name=${li.name}`);
      if (!li.catalogObjectId) continue;

      // Look up the PF item by the Square catalog variation ID
      const item = await getItemBySquareVariationId(li.catalogObjectId).catch((e) => {
        console.error(`[square/webhook] getItemBySquareVariationId error: ${e}`);
        return null;
      });
      if (!item) {
        console.log(`[square/webhook] no PF item found for variationId=${li.catalogObjectId}`);
        continue;
      }

      console.log(`[square/webhook] matched item=${item.id} name=${item.itemName}`);

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
        squarePaymentId: paymentId,
        squareOrderId: orderId,
        saleDate: paymentDate,
        payoutPaid: false,
      });
      console.log(`[square/webhook] created sale event for item=${item.id}`);

      const updatedItem = await applySquareSaleToItem({
        itemId: item.id,
        quantitySold: li.quantity,
        currentQuantity: item.quantity ?? 0,
        currentQuantitySold: item.quantitySold ?? 0,
        salePrice: unitPriceDollars,
        clientPayout,
      });
      console.log(`[square/webhook] applied sale to item=${item.id}`);

      if (updatedItem.status === "Sold" && updatedItem.primaryRoute !== "Estate Sale") {
        after(async () => {
          try {
            const [adminEmails, tenant, staffList] = await Promise.all([
              getAdminEmails().catch(() => [] as string[]),
              getTenantById(updatedItem.tenantId).catch(() => null),
              getStaffMembers().catch(() => []),
            ]);
            if (!adminEmails.length) return;

            // Resolve staff seller email — same dual-format + name fallback as items/PATCH
            const sellerId = updatedItem.staffSellerId?.trim();
            let staffSeller = sellerId
              ? staffList.find(s =>
                  (s.clerkUserId.trim() === sellerId || s.id.trim() === sellerId) &&
                  s.isActive && s.email)
              : null;
            if (!staffSeller && updatedItem.staffSellerName) {
              staffSeller = staffList.find(s =>
                s.displayName.trim().toLowerCase() === updatedItem.staffSellerName!.trim().toLowerCase() &&
                s.isActive && s.email
              ) ?? null;
            }
            const staffSellerEmail = staffSeller?.email ?? null;
            const ccEmails = staffSellerEmail && !adminEmails.includes(staffSellerEmail)
              ? [staffSellerEmail]
              : [];

            const projectName = tenant?.name ?? "Unknown Project";
            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
            const searchParam = updatedItem.barcodeNumber ? encodeURIComponent(updatedItem.barcodeNumber) : "";
            const catalogUrl = `${appUrl}/catalog?tenantId=${updatedItem.tenantId}${searchParam ? `&search=${searchParam}` : ""}`;
            const salePrice = unitPriceDollars;
            const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

            const html = buildItemSoldEmail({
              itemName: updatedItem.itemName,
              photoUrl: updatedItem.photos?.[0]?.url || updatedItem.photoUrl || undefined,
              projectName,
              itemId: updatedItem.id,
              barcodeNumber: updatedItem.barcodeNumber,
              primaryRoute: updatedItem.primaryRoute ?? "",
              salePrice,
              staffSellerName: updatedItem.staffSellerName || undefined,
              consignorPayout: clientPayout || undefined,
              saleDate: paymentDate,
              catalogUrl,
              markedSoldBySource: "Square",
            });

            const sendPayload: Parameters<typeof resend.emails.send>[0] = {
              from: "Rightsize Alerts <notifications@toptiertransitions.com>",
              to: adminEmails,
              subject: `Item Sold — ${updatedItem.itemName} for ${fmt(salePrice)}${updatedItem.staffSellerName ? ` · Great work, ${updatedItem.staffSellerName}!` : ""}`,
              html,
            };
            if (ccEmails.length > 0) sendPayload.cc = ccEmails;
            await resend.emails.send(sendPayload);
            console.log(`[square/webhook] item-sold notification to=${adminEmails.join(", ")} cc=${ccEmails.join(", ") || "none"}`);
          } catch (e) {
            console.error("[square/webhook] item-sold notification failed:", e);
          }
        });
      }

      processed++;
    }

    console.log(`[square/webhook] payment=${paymentId} processed=${processed} lineItems=${lineItems.length}`);
    return NextResponse.json({ ok: true, processed });
  } catch (e) {
    console.error(`[square/webhook] unhandled error: ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
