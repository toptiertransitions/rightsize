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
  getPartnerRequestsForTenant,
  setPartnerRequestStatus,
  getPartnerSelectionsForTenant,
} from "@/lib/airtable";
import { getPartnerDirectory } from "@/lib/partners/queries";
import { buildReferralPartner } from "@/lib/partners/referral";
import { getCommunityCompletionCounts, resolveTenantCommunity, communityCompletionKey } from "@/lib/partners/communityCompletions";
import { matchPartnersForCategory } from "@/lib/partners/match";
import { orderCategoriesForNonTTTClient, buildTTTMoveManagerPartner, TTT_MOVE_MANAGER_PARTNER_ID, nonTTTCategoryLabel } from "@/lib/partners/nonTTTCategories";
import { sendZeroMatchAdminNotification } from "@/lib/admin-notifications";
import { isPartnerRequestComplete, migrateLegacyAnswerKeys } from "@/lib/partners/questions";
import { scoreAndRankPartners, getRequestLocation, type ScoringResult } from "@/lib/partners/scoring";
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

  const [rawDirectory, selectionRows] = await Promise.all([
    getPartnerDirectory(),
    getPartnerSelectionsForTenant(tenantId).catch(() => []),
  ]);
  const selections: Partial<Record<PartnerCategory, string>> = {};
  for (const s of selectionRows) selections[s.category] = s.partnerId;

  // Attach this project's community-completion stats onto CLONED partner
  // objects — getPartnerDirectory() is a 5-minute shared cache, so mutating
  // its entries directly would leak one tenant's community stat into every
  // other tenant's view for the rest of the cache window.
  const tenantCommunity = await resolveTenantCommunity(tenant);
  let directory = rawDirectory;
  if (tenantCommunity) {
    const counts = await getCommunityCompletionCounts();
    directory = rawDirectory.map((p) => {
      const count = counts[communityCompletionKey(tenantCommunity.communityKey, p.category, p.id)] ?? 0;
      return count > 0 ? { ...p, communityCompletionCount: count, communityName: tenantCommunity.communityName } : p;
    });
  }

  const location = { zip: tenant.zip, state: tenant.state };
  const matchesByCategory = {} as Record<PartnerCategory, MatchResult[]>;
  for (const category of PARTNER_CATEGORIES) {
    // Community is a browsable listing of every CRM Active Referral senior-
    // living community, not a curated top pick — never capped at 3 like the
    // other service categories.
    const topN = category === "Community" ? Infinity : 3;
    matchesByCategory[category] = matchPartnersForCategory(directory, category, location, topN);
  }

  const partnersById: Record<string, PartnerProfile> = {};
  for (const p of directory) partnersById[p.id] = p;

  // Referral-locked categories: the partner who referred this client is
  // their partner for that category, full stop — they replace the
  // category's marketplace matches entirely (same approach as the Team Lead
  // injection below). Keyed by the real partner id, so files already
  // uploaded for that partner stay attached; the locked UI is driven by
  // lockedCategories, never by the partner object itself.
  const canRemoveReferral = sysRole === "TTTAdmin";
  const referralPartners: Partial<Record<PartnerCategory, PartnerProfile>> = {};
  for (const sel of selectionRows) {
    if (!sel.referralLocked) continue;
    const partner = buildReferralPartner(sel, directory);
    referralPartners[sel.category] = partner;
    partnersById[partner.id] = partner;
  }
  const lockedCategories = Object.keys(referralPartners) as PartnerCategory[];

  // NonTTTClient: entirely separate render path, computed and returned here
  // so the TTT branch below (including the Team Lead injection, which only
  // ever applies to isTTT===true projects anyway) is never reached for a
  // self-serve project.
  if (!isStaff && tenant.isTTT !== true) {
    // The tray resolves a selection by looking up partnersById[selections[category]]
    // — needs this entry present whether or not it's actually been selected yet.
    partnersById[TTT_MOVE_MANAGER_PARTNER_ID] = buildTTTMoveManagerPartner();

    const ordered = orderCategoriesForNonTTTClient(tenant.serviceInterests ?? []);
    // A referral-locked category is always shown, whether or not the client
    // picked it as a service interest during signup.
    const active = [...ordered.active, ...ordered.greyed.filter((c) => lockedCategories.includes(c))];
    const greyed = ordered.greyed.filter((c) => !lockedCategories.includes(c));
    const partnerRequests = await getPartnerRequestsForTenant(tenantId).catch(() => []);
    const initialRequestAnswers: Partial<Record<PartnerCategory, Record<string, string | string[]>>> = {};
    const initialIntroRequests: Partial<Record<PartnerCategory, { partnerId: string; requestedAt: string }[]>> = {};
    for (const r of partnerRequests) {
      // Migrated here, once, right where answers first enter this page —
      // everything downstream (isPartnerRequestComplete, scoreAndRankPartners,
      // the client wizard's initial state) sees only current-shape keys,
      // whether this request predates the zip-id normalization or not.
      r.answers = migrateLegacyAnswerKeys(r.category, r.answers);
      initialRequestAnswers[r.category] = r.answers;
      initialIntroRequests[r.category] = r.introRequests;
    }

    // Score + rank real matches for every active, completed, non-Move-Manager
    // request — Move Manager never has a PartnerRequest (static TTT card).
    const initialMatches: Partial<Record<PartnerCategory, ScoringResult>> = {};
    const statusBumps: Promise<unknown>[] = [];
    for (const category of active) {
      if (category === "Move Manager" || lockedCategories.includes(category)) continue;
      const request = partnerRequests.find((r) => r.category === category);
      if (!request || !isPartnerRequestComplete(category, request.answers)) continue;

      const location = getRequestLocation(category, request.answers, { zip: tenant.currentZip, state: tenant.state });
      const result = scoreAndRankPartners(directory, category, location, request.answers);
      initialMatches[category] = result;

      if (request.status === "draft") {
        if (result.best) {
          statusBumps.push(setPartnerRequestStatus(tenantId, category, "matched").catch(() => {}));
        } else {
          // Zero matches — alert staff once per request (the "matched"
          // status bump here just marks this request as processed, so the
          // alert doesn't re-fire on every page load; it's a loose reuse
          // of the existing status field, not a claim that a match exists).
          statusBumps.push(
            sendZeroMatchAdminNotification({
              clientName: tenant.name,
              projectName: tenant.name,
              tenantId,
              category: nonTTTCategoryLabel(category),
            })
              .then(() => setPartnerRequestStatus(tenantId, category, "matched"))
              .catch(() => {})
          );
        }
      }
    }
    if (statusBumps.length > 0) await Promise.all(statusBumps);

    return (
      <NonTTTPartnersPageClient
        tenantId={tenantId}
        tenantName={tenant.name}
        initialActiveCategories={active}
        initialGreyedCategories={greyed}
        initialSelections={selections}
        partnersById={partnersById}
        canEdit={canEdit}
        appOnlyIntent={tenant.appOnlyIntent ?? false}
        initialRequestAnswers={initialRequestAnswers}
        initialIntroRequests={initialIntroRequests}
        initialMatches={initialMatches}
        lockedCategories={lockedCategories}
        canRemoveReferral={canRemoveReferral}
        prefillTenant={{
          currentZip: tenant.currentZip,
          destinationZip: tenant.destinationZip,
          destinationType: tenant.destinationType,
          destinationCommunity: tenant.destinationCommunity,
          destinationCommunityOther: tenant.destinationCommunityOther,
          timelineType: tenant.timelineType,
          timelineValue: tenant.timelineValue,
          sqftRange: tenant.sqftRange,
          homeDensity: tenant.homeDensity,
          bedrooms: tenant.bedrooms,
        }}
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

  for (const category of lockedCategories) {
    matchesByCategory[category] = [{ partner: referralPartners[category]!, rank: 1, matchedLocation: "area" }];
  }

  return (
    <PartnersPageClient
      tenantId={tenantId}
      lockedCategories={lockedCategories}
      canRemoveReferral={canRemoveReferral}
      matchesByCategory={matchesByCategory}
      initialSelections={selections}
      partnersById={partnersById}
      canEdit={canEdit}
      isStaffPreview={isStaff}
      clientLabel={tenant.name}
    />
  );
}
