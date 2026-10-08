import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSystemRole, getMembershipsForUser, getTenantById } from "@/lib/airtable";
import { isNonTTTClient } from "@/lib/tips-access";
import { ALL_TOP_TIER_TIPS } from "@/content/tips";
import { TipsPage } from "@/components/tips/TipsPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tips | Rightsize by Top Tier" };

// Day of the year in Chicago, so the "Did you know?" tip changes daily and
// is the same for the server render and the client.
function dayOfYearChicago(): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const today = Date.UTC(get("year"), get("month") - 1, get("day"));
  return Math.floor((today - Date.UTC(get("year"), 0, 1)) / 86_400_000);
}

export default async function TipsRoute() {
  // Signed-out users never get here: middleware protects this route and the
  // (protected) layout redirects to /sign-in. Everyone except NonTTTClient
  // users goes back to Home, same as other role-scoped pages (e.g. /inbox).
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole) redirect("/home");
  const memberships = await getMembershipsForUser(userId).catch(() => []);
  const tenants = await Promise.all(memberships.map((m) => getTenantById(m.tenantId).catch(() => null)));
  if (!isNonTTTClient(sysRole, tenants)) redirect("/home");

  return <TipsPage tipOfDayIndex={dayOfYearChicago() % ALL_TOP_TIER_TIPS.length} />;
}
