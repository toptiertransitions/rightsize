import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getMembershipsForUser, getTenantById } from "@/lib/airtable";
import type { Tenant } from "@/lib/types";

export type OnboardingState =
  | { status: "signed_out" }
  | { status: "ineligible" } // TTT staff, or an invited TTT client
  | { status: "done"; tenantId: string }
  | { status: "fresh" }
  | { status: "resume"; tenant: Tenant };

// Determines what the /get-started page should render for the current user.
// Called server-side on every page load — cheap (one Clerk call already done
// by middleware, a couple of Airtable reads) and is the single source of
// truth for eligibility, so the page and the server actions can't drift.
export async function getOnboardingState(): Promise<OnboardingState> {
  const { userId } = await auth();
  if (!userId) return { status: "signed_out" };

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole) return { status: "ineligible" };

  const memberships = await getMembershipsForUser(userId).catch(() => []);
  for (const m of memberships) {
    const tenant = await getTenantById(m.tenantId).catch(() => null);
    if (!tenant) continue;
    if (tenant.isTTT === true) return { status: "ineligible" }; // invited TTT client
    if (tenant.onboardingComplete === true) return { status: "done", tenantId: tenant.id };
    return { status: "resume", tenant };
  }
  return { status: "fresh" };
}
