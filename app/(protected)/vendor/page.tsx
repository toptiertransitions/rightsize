import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getLocalVendorByClerkId, getItemsForVendor } from "@/lib/airtable";
import { VendorPortalClient } from "./VendorPortalClient";

export default async function VendorPortalPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const vendor = await getLocalVendorByClerkId(userId).catch(() => null);
  if (!vendor) redirect("/vendor/not-found");

  const items = await getItemsForVendor(vendor.id).catch(() => []);

  return <VendorPortalClient vendor={vendor} initialItems={items} />;
}
