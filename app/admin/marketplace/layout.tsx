import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { getSystemRole } from "@/lib/airtable";
import { canAccessMarketplaceAdmin } from "@/lib/marketplace/permissions";

// Access control for the whole /admin/marketplace section — every page and
// layout under this directory inherits this check, which is intentionally
// `notFound()` rather than the redirect-to-/home pattern every other
// /admin/* page uses, per the locked spec: "Unauthenticated or unauthorized
// requests get a 404, not a login hint."
//
// This same TTTAdmin/TTTManager check is independently re-run inside every
// server action in ./actions.ts — never rely on this layout alone, since a
// server action is its own callable entry point. It is NOT duplicated in
// the root middleware.ts: that file runs on the Edge runtime by default,
// and lib/airtable.ts (which getSystemRole needs) pulls in the `airtable`
// SDK and next/cache's unstable_cache, neither of which are safe to assume
// Edge-compatible — importing it there risks breaking EVERY request through
// middleware, not just marketplace ones, for a check that's already fully
// enforced at the page/route/action level below. No other /admin/* page in
// this codebase does its role check in middleware either.
export default async function MarketplaceAdminLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const role = await getSystemRole(userId);
  if (!canAccessMarketplaceAdmin(role)) notFound();

  return <>{children}</>;
}
