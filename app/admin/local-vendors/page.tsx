import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isTTTAdmin } from "@/lib/config";
import { getLocalVendors } from "@/lib/airtable";
import { LocalVendorsAdmin } from "./LocalVendorsAdmin";

export default async function LocalVendorsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isTTTAdmin(userId)) redirect("/home");

  const vendors = await getLocalVendors().catch(() => []);

  return <LocalVendorsAdmin vendors={vendors} />;
}
