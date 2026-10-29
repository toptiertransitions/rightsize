// Who sees the "Tips" page: NonTTTClient users only. NonTTTClient isn't a
// stored role; it's derived the same way the Home and Partners pages do it
// (`!isStaff && tenant.isTTT !== true`), applied across all of the user's
// projects: no TTT system role, at least one project, and none of their
// projects is a TTT project. If a project later becomes a TTT project, the
// tab goes away on its own. Partner Portal users never reach app pages
// (middleware keeps them in /partner).
import type { Tenant } from "@/lib/types";

export function isNonTTTClient(sysRole: string | null, tenants: Array<Pick<Tenant, "isTTT"> | null>): boolean {
  if (sysRole) return false;
  const known = tenants.filter((t): t is Pick<Tenant, "isTTT"> => !!t);
  return known.length > 0 && known.every((t) => t.isTTT !== true);
}

// Day of the year in Chicago, so the "Did you know?" tip changes daily and
// is the same for the server render and the client.
export function dayOfYearChicago(): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const today = Date.UTC(get("year"), get("month") - 1, get("day"));
  return Math.floor((today - Date.UTC(get("year"), 0, 1)) / 86_400_000);
}
