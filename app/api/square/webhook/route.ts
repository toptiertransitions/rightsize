export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import {
  getItemBySquareVariationId,
  createItemSaleEvent,
  applySquareSaleToItem,
  getSaleEventBySquarePaymentId,
} from "@/lib/airtable";
import { validateSquareWebhookSignature, getSquareOrder } from "@/lib/square";

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

      await applySquareSaleToItem({
        itemId: item.id,
        quantitySold: li.quantity,
        currentQuantity: item.quantity ?? 0,
        currentQuantitySold: item.quantitySold ?? 0,
      });
      console.log(`[square/webhook] applied sale to item=${item.id}`);

      processed++;
    }

    console.log(`[square/webhook] payment=${paymentId} processed=${processed} lineItems=${lineItems.length}`);
    return NextResponse.json({ ok: true, processed });
  } catch (e) {
    console.error(`[square/webhook] unhandled error: ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
