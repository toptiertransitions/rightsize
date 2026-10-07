// "Item Sold" email for items sold through the ProFound Finds checkout on
// the FB/Marketplace route (Home Pickup sales). Same email, recipients, and
// breakdown as marking an item Sold by hand in Rightsize (see the item-sold
// block in app/api/items/route.ts PATCH): all TTTAdmins, with the item's
// staff seller cc'd. No Zelle lookup: these are paid by card at checkout.
import { Resend } from "resend";
import { getAdminEmails } from "./admin-notifications";
import { getStaffMembers, getTenantById } from "./airtable";
import { buildItemSoldEmail } from "./email";
import type { Item } from "./types";

export async function sendOnlineItemSoldNotification(params: {
  item: Item;
  salePrice: number;
  buyerName: string;
  consignorPayout: number;
  saleDate: string;
}): Promise<void> {
  const { item, salePrice, buyerName, consignorPayout, saleDate } = params;
  const [adminEmails, tenant, staffList] = await Promise.all([
    getAdminEmails().catch(() => [] as string[]),
    getTenantById(item.tenantId).catch(() => null),
    getStaffMembers().catch(() => []),
  ]);
  if (!adminEmails.length) {
    console.warn("[online-item-sold] skipped — no admin recipients");
    return;
  }

  // Same seller match as the manual flow: Clerk id or Airtable id, then name
  const sellerId = item.staffSellerId?.trim();
  let seller = sellerId
    ? staffList.find((s) => (s.clerkUserId.trim() === sellerId || s.id.trim() === sellerId) && s.isActive && s.email)
    : undefined;
  if (!seller && item.staffSellerName) {
    const norm = (n: string) => n.replace(/\s+/g, "").toLowerCase();
    seller = staffList.find((s) => norm(s.displayName) === norm(item.staffSellerName!) && s.isActive && s.email);
  }
  const cc = seller?.email && !adminEmails.includes(seller.email) ? [seller.email] : [];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
  const search = item.barcodeNumber ? `&search=${encodeURIComponent(item.barcodeNumber)}` : "";
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const html = buildItemSoldEmail({
    itemName: item.itemName,
    photoUrl: item.photos?.[0]?.url || item.photoUrl || undefined,
    projectName: tenant?.name ?? "Unknown Project",
    itemId: item.id,
    barcodeNumber: item.barcodeNumber,
    primaryRoute: item.primaryRoute ?? "",
    salePrice,
    staffSellerName: item.staffSellerName || undefined,
    buyerName: buyerName || undefined,
    consignorPayout: consignorPayout || undefined,
    saleDate,
    catalogUrl: `${appUrl}/catalog?tenantId=${item.tenantId}${search}`,
    markedSoldBySource: "Online",
    isAdjustment: false,
    changedFields: [],
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: "Rightsize Alerts <notifications@toptiertransitions.com>",
    to: adminEmails,
    ...(cc.length ? { cc } : {}),
    subject: `Item Sold — ${item.itemName} for ${fmt(salePrice)}${item.staffSellerName ? ` · Great work, ${item.staffSellerName}!` : ""}`,
    html,
  });
  if (error) console.error("[online-item-sold] Resend error:", error);
  else console.log(`[online-item-sold] sent to=${adminEmails.join(", ")} cc=${cc.join(", ") || "none"}`);
}
