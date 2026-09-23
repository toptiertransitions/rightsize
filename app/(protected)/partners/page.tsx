import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  getSystemRole,
  getUserRoleForTenant,
  getMembershipsForUser,
  getTenantById,
  getTenants,
  getSignedTenantIds,
  getStaffMembers,
} from "@/lib/airtable";
import { getPartnerDirectory, getSelectionsMapForTenant } from "@/lib/partners/queries";
import { matchPartnersForCategory } from "@/lib/partners/match";
import { orderCategoriesForNonTTTClient } from "@/lib/partners/nonTTTCategories";
import { PARTNER_CATEGORIES, type PartnerCategory } from "@/lib/types";
import type { MatchResult, PartnerProfile } from "@/lib/partners/types";
import { PartnersPageClient } from "@/components/partners/PartnersPageClient";
import { NonTTTPartnersPageClient } from "@/components/partners/NonTTTPartnersPageClient";
import { StaffProjectPicker } from "@/components/partners/StaffProjectPicker";
import { Card, CardContent } from "@/components/ui/Card";

export const metadata = { robots: "noindex, nofollow" };

const STAFF_EDIT_ROLES = ["TTTTeamLead", "TTTManager", "TTTAdmin"];
const CLIENT_EDIT_ROLES = ["Owner", "Collaborator"];

interface PageProps {
  // Named to match the app-wide convention (Plan/Catalog/Vendors/etc.) so the
  // shared Header's ProjectSwitcher dropdown and its localStorage-persisted
  // "last viewed project" both work here without any special-casing.
  searchParams: Promise<{ tenantId?: string }>;
}

export default async function PartnersPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { tenantId: urlTenantId } = await searchParams;
  const sysRole = await getSystemRole(userId).catch(() => null);
  const isStaff = !!sysRole;

  let tenantId: string | null = null;
  let tenantRole: string | null = null;

  if (urlTenantId) {
    tenantRole = await getUserRoleForTenant(userId, urlTenantId).catch(() => null);
    if (!tenantRole && !isStaff) notFound();
    tenantId = urlTenantId;
  } else if (isStaff) {
    // No project selected — same search-driven picker as Plan/Catalog, scoped
    // to Active + Post-Move Consignment (signed, not archived, not lost, TTT-
    // managed). Partners is always single-project, so unlike Catalog there's
    // no "all projects" aggregate mode to offer here.
    const [allTenantsRaw, signedTenantIds] = await Promise.all([
      getTenants().catch(() => []),
      getSignedTenantIds().catch(() => new Set<string>()),
    ]);
    const projects = allTenantsRaw
      .filter((t) => (t.isTTT ?? true) && !t.isArchived && !t.isLostDeal && signedTenantIds.has(t.id))
      .map((t) => ({ id: t.id, name: t.name }));

    return <StaffProjectPicker projects={projects} />;
  } else {
    const memberships = await getMembershipsForUser(userId).catch(() => []);
    if (memberships.length === 0) redirect("/onboarding");

    if (memberships.length === 1) {
      tenantId = memberships[0].tenantId;
      tenantRole = memberships[0].role;
    } else {
      const tenants = await Promise.all(memberships.map((m) => getTenantById(m.tenantId).catch(() => null)));
      const valid = tenants
        .map((t, i) => ({ tenant: t, membership: memberships[i] }))
        .filter((x): x is { tenant: NonNullable<typeof x.tenant>; membership: typeof memberships[0] } => x.tenant != null);

      return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Your Partners</h1>
          <p className="text-gray-500 mb-6">Select a project to see its matched partners.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {valid.map(({ tenant }) => (
              <Link key={tenant.id} href={`/partners?tenantId=${tenant.id}`}>
                <Card hover>
                  <CardContent>
                    <h3 className="font-bold text-gray-900">{tenant.name}</h3>
                    <p className="text-sm text-gray-400 mt-0.5">View partners</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      );
    }
  }

  if (!tenantId) redirect("/home");
  if (!isStaff && !tenantRole) redirect("/home");

  const tenant = await getTenantById(tenantId).catch(() => null);
  if (!tenant) notFound();

  const canEdit =
    (!!sysRole && STAFF_EDIT_ROLES.includes(sysRole)) ||
    (!!tenantRole && CLIENT_EDIT_ROLES.includes(tenantRole));

  const [directory, selections] = await Promise.all([
    getPartnerDirectory(),
    getSelectionsMapForTenant(tenantId),
  ]);

  const location = { zip: tenant.zip, state: tenant.state };
  const matchesByCategory = {} as Record<PartnerCategory, MatchResult[]>;
  for (const category of PARTNER_CATEGORIES) {
    matchesByCategory[category] = matchPartnersForCategory(directory, category, location, 3);
  }

  const partnersById: Record<string, PartnerProfile> = {};
  for (const p of directory) partnersById[p.id] = p;

  // NonTTTClient: entirely separate render path, computed and returned here
  // so the TTT branch below (including the Team Lead injection, which only
  // ever applies to isTTT===true projects anyway) is never reached for a
  // self-serve project.
  if (!isStaff && tenant.isTTT !== true) {
    const { active, greyed } = orderCategoriesForNonTTTClient(tenant.serviceInterests ?? []);
    return (
      <NonTTTPartnersPageClient
        tenantId={tenantId}
        tenantName={tenant.name}
        initialActiveCategories={active}
        initialGreyedCategories={greyed}
        matchesByCategory={matchesByCategory}
        initialSelections={selections}
        partnersById={partnersById}
        canEdit={canEdit}
        appOnlyIntent={tenant.appOnlyIntent ?? false}
      />
    );
  }

  // TTT-managed projects with an assigned Team Lead get Top Tier Transitions
  // itself as the sole Move Manager — not a marketplace choice, so it
  // replaces (not adds to) whatever the normal directory match returned and
  // is never written to PartnerSelections.
  if (tenant.isTTT === true && tenant.teamLeadClerkId) {
    const [staffMembers, teamLeadClerkUser] = await Promise.all([
      getStaffMembers().catch(() => []),
      (await clerkClient()).users.getUser(tenant.teamLeadClerkId).catch(() => null),
    ]);
    const lead = staffMembers.find((m) => m.clerkUserId === tenant.teamLeadClerkId);
    const teamLeadName = lead?.displayName || [teamLeadClerkUser?.firstName, teamLeadClerkUser?.lastName].filter(Boolean).join(" ") || undefined;

    if (teamLeadName) {
      const syntheticId = `team-lead-${tenant.teamLeadClerkId}`;
      const teamLeadPartner: PartnerProfile = {
        id: syntheticId,
        vendorName: "Top Tier Transitions",
        category: "Move Manager",
        logo: teamLeadClerkUser?.imageUrl || undefined,
        zipCodesServed: "",
        city: tenant.city ?? "",
        state: tenant.state ?? "",
        avgRating: 0,
        rawAvgRating: 0,
        reviewCount: 0,
        projectsCompleted: 0,
        isTeamLead: true,
        teamLeadName,
        phone: lead?.phone || undefined,
      };
      matchesByCategory["Move Manager"] = [{ partner: teamLeadPartner, rank: 1, matchedLocation: "area" }];
      partnersById[syntheticId] = teamLeadPartner;
      selections["Move Manager"] = syntheticId;
    }
  }

  return (
    <PartnersPageClient
      tenantId={tenantId}
      matchesByCategory={matchesByCategory}
      initialSelections={selections}
      partnersById={partnersById}
      canEdit={canEdit}
      isStaffPreview={isStaff}
      clientLabel={tenant.name}
    />
  );
}
