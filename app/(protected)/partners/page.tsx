import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  getSystemRole,
  getUserRoleForTenant,
  getMembershipsForUser,
  getTenantById,
} from "@/lib/airtable";
import { getPartnerDirectory, getSelectionsMapForTenant } from "@/lib/partners/queries";
import { matchPartnersForCategory } from "@/lib/partners/match";
import { PARTNER_CATEGORIES, type PartnerCategory } from "@/lib/types";
import type { MatchResult, PartnerProfile } from "@/lib/partners/types";
import { PartnersPageClient } from "@/components/partners/PartnersPageClient";
import { Card, CardContent } from "@/components/ui/Card";

export const metadata = { robots: "noindex, nofollow" };

const STAFF_EDIT_ROLES = ["TTTTeamLead", "TTTManager", "TTTAdmin"];
const CLIENT_EDIT_ROLES = ["Owner", "Collaborator"];

interface PageProps {
  searchParams: Promise<{ project?: string }>;
}

export default async function PartnersPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { project } = await searchParams;
  const sysRole = await getSystemRole(userId).catch(() => null);
  const isStaff = !!sysRole;

  let tenantId: string | null = null;
  let tenantRole: string | null = null;

  if (project) {
    tenantRole = await getUserRoleForTenant(userId, project).catch(() => null);
    if (!tenantRole && !isStaff) notFound();
    tenantId = project;
  } else if (isStaff) {
    // No project selected — staff always preview via an explicit ?project=,
    // there's no default "all projects" view here.
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="text-lg font-bold text-gray-900 mb-2">Partners — staff preview</h1>
        <p className="text-sm text-gray-500">
          Add <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">?project=&lt;tenantId&gt;</code> to the URL to preview a client&rsquo;s Partners page.
        </p>
      </div>
    );
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
              <Link key={tenant.id} href={`/partners?project=${tenant.id}`}>
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
