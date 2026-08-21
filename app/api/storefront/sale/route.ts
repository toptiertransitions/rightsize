import { NextRequest, NextResponse } from "next/server";
import { getItemById, updateItem, createItem, createItemSaleEvent, getSaleEventByPaymentAndItem, logFailedSaleSync, getEstateById, createStorefrontBuyer, upsertShopperFromPurchase, updateShopperCategoryInterests } from "@/lib/airtable";

function checkAuth(req: NextRequest): boolean {
  const key = req.headers.get("x-storefront-api-key");
  return key === process.env.STOREFRONT_API_KEY;
}

async function attemptRecordSale(data: {
  itemId: string;
  stripePaymentIntentId: string;
  salePrice: number;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  buyerMarketingConsent?: boolean;
  buyerConsentAt?: string;
  quantityPurchased?: number;
}): Promise<{ estateSlug?: string; estateSaleId?: string; estateName?: string; alreadyRecorded?: boolean }> {
  // ── Idempotency check ───────────────────────────────────────────────────────
  // Stripe can retry webhooks and our own retry loop can re-enter this function.
  // If a sale event already exists for this payment intent + item, the sale was
  // already recorded — return early without creating a duplicate.
  const existing = await getSaleEventByPaymentAndItem(data.stripePaymentIntentId, data.itemId);
  if (existing) {
    console.log(`[storefront/sale] Duplicate suppressed — event already exists for PI ${data.stripePaymentIntentId} item ${data.itemId}`);
    // Still need to return estate info for cache busting
    const item = await getItemById(data.itemId).catch(() => null);
    if (item?.primaryRoute === "Estate Sale" && item.estateSaleId) {
      const estate = await getEstateById(item.estateSaleId).catch(() => null);
      if (estate) return { estateSlug: estate.slug, estateSaleId: item.estateSaleId, estateName: estate.name, alreadyRecorded: true };
    }
    return { alreadyRecorded: true };
  }
  // ────────────────────────────────────────────────────────────────────────────

  const item = await getItemById(data.itemId);
  if (!item) throw new Error(`Item ${data.itemId} not found`);
  if (item.primaryRoute !== "ProFoundFinds Consignment" && item.primaryRoute !== "Estate Sale") {
    throw new Error(`Item ${data.itemId} has unexpected primaryRoute: ${item.primaryRoute}`);
  }

  const saleDate = new Date().toISOString().split("T")[0];
  const itemTotalQty = item.quantity ?? 1;
  const qtyPurchased = Math.min(data.quantityPurchased ?? 1, itemTotalQty);
  const unitPrice = Math.round((data.salePrice / qtyPurchased) * 100) / 100;

  // Estate Sale defaults to 67% client payout (33% TTT take) when clientSharePercent is unset.
  const clientPct = item.clientSharePercent || (item.primaryRoute === "Estate Sale" ? 67 : 0);
  const consignorPayout = clientPct > 0
    ? Math.round(data.salePrice * (clientPct / 100) * 100) / 100
    : 0;

  const saleFields = {
    salePrice: data.salePrice,
    saleDate,
    saleChannel: "Online" as const,
    buyerName: data.buyerName,
    buyerEmail: data.buyerEmail,
    buyerPhone: data.buyerPhone,
    buyerMarketingConsent: data.buyerMarketingConsent,
    buyerConsentAt: data.buyerConsentAt,
    stripePaymentIntentId: data.stripePaymentIntentId,
    consignorPayout,
    completedDate: saleDate,
  };

  if (qtyPurchased >= itemTotalQty) {
    // Buying all available units — mark the original item sold (existing behavior)
    await updateItem(data.itemId, { status: "Sold", quantity: qtyPurchased, ...saleFields });
  } else {
    // Partial purchase — create a sold copy for the units purchased, reduce original
    const soldCopy = await createItem({
      tenantId: item.tenantId,
      itemName: item.itemName,
      category: item.category,
      condition: item.condition,
      conditionNotes: item.conditionNotes,
      photos: item.photos,
      photoUrl: item.photoUrl,
      photoPublicId: item.photoPublicId,
      valueMid: unitPrice,
      valueLow: item.valueLow,
      valueHigh: item.valueHigh,
      brand: item.brand,
      listingDescriptionEbay: item.listingDescriptionEbay,
      primaryRoute: item.primaryRoute,
      estateSaleId: item.estateSaleId,
      clientSharePercent: item.clientSharePercent,
      storefrontActive: false,
      status: "Sold",
      quantity: qtyPurchased,
    });
    await updateItem(soldCopy.id, saleFields);
    // Reduce original item's available quantity
    await updateItem(data.itemId, {
      quantity: itemTotalQty - qtyPurchased,
      quantitySold: (item.quantitySold ?? 0) + qtyPurchased,
    });
  }

  // SaleEvent always recorded against original item ID for idempotency
  await createItemSaleEvent({
    itemId: data.itemId,
    tenantId: item.tenantId,
    itemName: item.itemName,
    quantitySold: qtyPurchased,
    unitPrice,
    totalAmount: data.salePrice,
    clientPayout: consignorPayout,
    squarePaymentId: data.stripePaymentIntentId,
    squareOrderId: "",
    saleDate,
    payoutPaid: false,
  });

  // Return estate info so the caller can bust the estate ISR cache and log buyer
  let estateSlug: string | undefined;
  let estateSaleId: string | undefined;
  let estateName: string | undefined;
  if (item.primaryRoute === "Estate Sale" && item.estateSaleId) {
    const estate = await getEstateById(item.estateSaleId).catch(() => null);
    if (estate) {
      estateSlug = estate.slug;
      estateSaleId = item.estateSaleId;
      estateName = estate.name;
    }
  }

  // Log buyer to StorefrontBuyers table for future outreach
  try {
    await createStorefrontBuyer({
      buyerName: data.buyerName,
      buyerEmail: data.buyerEmail,
      buyerPhone: data.buyerPhone,
      marketingConsent: data.buyerMarketingConsent ?? false,
      consentAt: data.buyerConsentAt ?? new Date().toISOString(),
      itemId: data.itemId,
      itemName: item.itemName,
      estateSaleId,
      estateName,
      estateSlug,
      purchaseAmount: data.salePrice,
      quantityPurchased: qtyPurchased > 1 ? qtyPurchased : undefined,
    });
  } catch (e) {
    console.error("[storefront/sale] createStorefrontBuyer failed (non-fatal):", e);
  }

  // Sync shopper CRM record — create on first purchase, update spend/count on repeat
  try {
    await upsertShopperFromPurchase({
      name: data.buyerName,
      email: data.buyerEmail.toLowerCase().trim(),
      phone: data.buyerPhone,
      source: estateSaleId ? "Online Estate Sale" : "Online Catalog",
      purchaseAmount: data.salePrice,
      purchaseDate: saleDate,
    });
  } catch (e) {
    console.error("[storefront/sale] upsertShopperFromPurchase failed (non-fatal):", e);
  }

  // Update shopper's top-5 category interests based on all purchases (fire-and-forget)
  updateShopperCategoryInterests(data.buyerEmail).catch(e =>
    console.error("[storefront/sale] updateShopperCategoryInterests failed (non-fatal):", e)
  );

  return { estateSlug, estateSaleId, estateName };
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    itemId: string;
    stripePaymentIntentId: string;
    salePrice: number;
    buyerName: string;
    buyerEmail: string;
    buyerPhone?: string;
    buyerMarketingConsent?: boolean;
    buyerConsentAt?: string;
    quantityPurchased?: number;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { itemId, stripePaymentIntentId, salePrice, buyerName, buyerEmail, buyerPhone, buyerMarketingConsent, buyerConsentAt, quantityPurchased } = body;
  if (!itemId || !stripePaymentIntentId || !salePrice || !buyerName || !buyerEmail) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const MAX_RETRIES = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { estateSlug, alreadyRecorded } = await attemptRecordSale({ itemId, stripePaymentIntentId, salePrice, buyerName, buyerEmail, buyerPhone, buyerMarketingConsent, buyerConsentAt, quantityPurchased });

      // Ping storefront to invalidate ISR cache (item + estate page if applicable)
      const storefrontUrl = process.env.STOREFRONT_URL;
      const webhookSecret = process.env.STOREFRONT_WEBHOOK_SECRET;
      if (storefrontUrl && webhookSecret) {
        fetch(`${storefrontUrl}/api/storefront/webhook/item-updated`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webhook-secret": webhookSecret,
          },
          body: JSON.stringify({ itemId, event: "sale", estateSlug }),
        }).catch((e) => console.error("[storefront/sale] Webhook ping failed:", e));
      }

      return NextResponse.json({ success: true, alreadyRecorded: alreadyRecorded ?? false });
    } catch (e) {
      lastError = e;
      console.error(`[storefront/sale] Attempt ${attempt} failed:`, e);
      if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }

  // All retries failed — log to FailedSaleSync
  try {
    await logFailedSaleSync({
      itemId,
      payload: JSON.stringify(body),
      error: String(lastError),
      retryCount: MAX_RETRIES,
    });
  } catch (logErr) {
    console.error("[storefront/sale] logFailedSaleSync failed:", logErr);
  }

  return NextResponse.json({ error: "Failed to record sale after retries" }, { status: 500 });
}
