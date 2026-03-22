import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getItemsByPrimaryRoute, getTenants } from "@/lib/airtable";
import type { SoldItemRow } from "@/lib/types";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  const canViewAll = sysRole === "TTTAdmin" || sysRole === "TTTManager";
  if (!canViewAll) return NextResponse.json({ items: [] });

  const [fbItems, ebayItems, allTenants] = await Promise.all([
    getItemsByPrimaryRoute("FB/Marketplace").catch(() => []),
    getItemsByPrimaryRoute("Online Marketplace").catch(() => []),
    getTenants().catch(() => []),
  ]);

  const tenantNameMap = new Map(allTenants.map(t => [t.id, t.name]));
  const soldItems: SoldItemRow[] = [];

  for (const item of fbItems) {
    if (item.status === "Sold" && item.saleDate) {
      soldItems.push({
        saleDate: item.saleDate.slice(0, 10),
        staffSellerName: item.staffSellerName,
        tenantName: tenantNameMap.get(item.tenantId) ?? "",
        itemName: item.itemName,
        valueMid: item.valueMid,
        staffCommissionPercent: item.staffCommissionPercent,
        staffTimeMinutes: item.staffTimeMinutes,
        channel: "FB",
      });
    }
  }
  for (const item of ebayItems) {
    if (item.status === "Sold" && item.saleDate) {
      soldItems.push({
        saleDate: item.saleDate.slice(0, 10),
        staffSellerName: item.staffSellerName,
        tenantName: tenantNameMap.get(item.tenantId) ?? "",
        itemName: item.itemName,
        valueMid: item.valueMid,
        staffCommissionPercent: item.staffCommissionPercent,
        staffTimeMinutes: item.staffTimeMinutes,
        channel: "eBay",
      });
    }
  }

  return NextResponse.json({ items: soldItems });
}
