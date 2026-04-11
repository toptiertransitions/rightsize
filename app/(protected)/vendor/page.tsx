import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getLocalVendorByClerkId, getItemsForVendor, getTenantById } from "@/lib/airtable";
import { VendorPortalClient } from "./VendorPortalClient";

export default async function VendorPortalPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const vendor = await getLocalVendorByClerkId(userId).catch(() => null);
  if (!vendor) redirect("/vendor/not-found");

  const items = await getItemsForVendor(vendor.id).catch(() => []);

  // Fetch city for each unique tenant so cards can show location
  const uniqueTenantIds = [...new Set(items.map(i => i.tenantId).filter(Boolean))];
  const tenants = await Promise.all(uniqueTenantIds.map(id => getTenantById(id).catch(() => null)));
  const tenantCityMap: Record<string, string> = {};
  for (const t of tenants) {
    if (t?.id && t.city) tenantCityMap[t.id] = t.city;
  }

  return <VendorPortalClient vendor={vendor} initialItems={items} tenantCityMap={tenantCityMap} />;
}
