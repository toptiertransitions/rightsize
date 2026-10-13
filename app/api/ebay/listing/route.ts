import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isTTTAdmin } from "@/lib/config";
import { getItemById, updateItem } from "@/lib/airtable";
import { getAdminEmails } from "@/lib/admin-notifications";
import { friendlyEbayError, publishEbayListing, updateEbayListing } from "@/lib/ebay";
import { buildEbayListingEmail } from "@/lib/email";
import { Resend } from "resend";
import { ctDateStr } from "@/lib/date-ct";
import type { Item } from "@/lib/types";

// Used when an item has no weight entered and is listed on eBay
const DEFAULT_EBAY_WEIGHT_LBS = 50;

const resend = new Resend(process.env.RESEND_API_KEY);

async function fireListingEmail(item: Item, listingId: string) {
  const adminEmails = await getAdminEmails().catch(() => [] as string[]);
  if (!adminEmails.length) return;

  const html = buildEbayListingEmail({
    itemName:    item.listingTitleEbay || item.itemName,
    category:    item.category,
    condition:   item.condition,
    price:       item.valueMid ?? 0,
    listingId,
    listingUrl:  `https://www.ebay.com/itm/${listingId}`,
    rightsizeUrl: "https://rightsize.vercel.app/admin/ebay",
  });

  await resend.emails.send({
    from:    "Top Tier Transitions <noreply@toptiertransitions.com>",
    to:      adminEmails,
    subject: `eBay Listing Published — ${item.listingTitleEbay || item.itemName}`,
    html,
  });
}

// POST — publish new listing
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { itemId } = await req.json() as { itemId: string };
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  let item = await getItemById(itemId).catch(() => null);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  // eBay's calculated shipping needs a weight. When none is entered, List It
  // (and bulk List Online) fills in a 50 lb default and saves it on the item
  // in Rightsize, so it's visible and can be corrected later.
  const hasWeight = (item.weightPounds ?? 0) > 0 || (item.weightOunces ?? 0) > 0;
  if (!hasWeight) {
    item = await updateItem(itemId, { weightPounds: DEFAULT_EBAY_WEIGHT_LBS, weightOunces: 0 }).catch(() => ({ ...item!, weightPounds: DEFAULT_EBAY_WEIGHT_LBS, weightOunces: 0 }));
  }

  // Mark pending immediately so the UI can show a spinner
  await updateItem(itemId, { ebayListingStatus: "Pending" }).catch(() => {});

  try {
    const { listingId, offerId } = await publishEbayListing(item);
    const today = ctDateStr(new Date().toISOString());

    const updated = await updateItem(itemId, {
      ebayListingId:     listingId,
      ebayOfferId:       offerId,
      ebayListingStatus: "Active",
      ebayLastSyncedAt:  today,
      ebaySyncError:     "",
      alsoListedOnline:  true,
    });

    fireListingEmail(item, listingId).catch(e => console.error("[ebay-email]", e));

    return NextResponse.json({ item: updated });
  } catch (err) {
    const msg = friendlyEbayError(err instanceof Error ? err.message : String(err), item);
    await updateItem(itemId, { ebayListingStatus: "Error", ebaySyncError: msg }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH — sync updated item data to existing listing
export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { itemId } = await req.json() as { itemId: string };
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  const item = await getItemById(itemId).catch(() => null);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  try {
    await updateEbayListing(item);
    const today = ctDateStr(new Date().toISOString());

    const updated = await updateItem(itemId, {
      ebayLastSyncedAt: today,
      ebaySyncError:    "",
    });

    return NextResponse.json({ item: updated });
  } catch (err) {
    const msg = friendlyEbayError(err instanceof Error ? err.message : String(err), item);
    await updateItem(itemId, { ebayListingStatus: "Error", ebaySyncError: msg }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
