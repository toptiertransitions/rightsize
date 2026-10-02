import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isTTTAdmin } from "@/lib/config";
import {
  getLocalVendors,
  getTenants,
  getAllPartnerCommunityCompletions,
} from "@/lib/airtable";
import { LocalVendorsAdmin } from "./LocalVendorsAdmin";

export default async function LocalVendorsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isTTTAdmin(userId)) redirect("/home");

  const [vendors, allTenants, completions] = await Promise.all([
    getLocalVendors().catch(() => []),
    getTenants().catch(() => []),
    getAllPartnerCommunityCompletions().catch(() => []),
  ]);
  // Same source as the onboarding "Where are you moving" community search —
  // not the CRM's Sales-managed "Senior Living" company list — so an
  // admin-tagged completion's communityId always lands in the same ID
  // namespace as a client's destinationCommunity (see resolveTenantCommunity).
  const seniorCommunities = vendors.filter((v) => v.vendorType === "Future Home/Community");

  return (
    <LocalVendorsAdmin
      vendors={vendors}
      projects={allTenants.map((t) => ({
        id: t.id,
        name: t.name,
        city: t.city ?? "",
        state: t.state ?? "",
        isArchived: t.isArchived ?? false,
        isTTT: t.isTTT ?? true,
        destinationCommunity: t.destinationCommunity,
        destinationCommunityOther: t.destinationCommunityOther,
        seniorCommunityName: t.seniorCommunityName,
        createdAt: t.createdAt,
        archivedAt: t.archivedAt,
      }))}
      seniorCommunities={seniorCommunities.map((c) => ({ id: c.id, name: c.vendorName, city: c.city }))}
      completions={completions}
    />
  );
}
