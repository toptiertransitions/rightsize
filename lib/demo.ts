// Demo projects (e.g. the Google Play / App Store review account) — listed by
// tenant id in DEMO_TENANT_IDS. Actions that would reach real partners or
// create CRM records are recorded in-app only for these projects.
export function isDemoTenant(tenantId: string | null | undefined): boolean {
  if (!tenantId) return false;
  return (process.env.DEMO_TENANT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(tenantId);
}
