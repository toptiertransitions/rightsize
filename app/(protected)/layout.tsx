export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { PushNotificationBootstrap } from "@/components/shared/PushNotificationBootstrap";
import { getSystemRole, getMembershipsForUser, getTenantById } from "@/lib/airtable";
import { isNonTTTClient } from "@/lib/tips-access";
import { resolveBrand } from "@/lib/brands/resolve";
import { brandCss } from "@/lib/brands/shared";
import { BrandPreviewBanner } from "@/components/brands/BrandPreviewBanner";
import type { Tenant } from "@/lib/types";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, sessionClaims } = await auth();
  if (!userId) redirect("/sign-in");

  const sysRole = await getSystemRole(userId).catch(() => null);
  const isAdmin = sysRole === "TTTAdmin";
  const isSales = sysRole === "TTTSales";
  const isManager = sysRole === "TTTManager" || sysRole === "TTTAdmin";
  const isStaff = ["TTTStaff", "TTTTeamLead", "TTTManager", "TTTSales", "TTTAdmin"].includes(sysRole ?? "");
  // iOS app only: the compact icon nav is scoped to exactly these three —
  // regular project members ("client", no system role), TTTStaff, and
  // TTTTeamLead. TTTManager/TTTAdmin/TTTSales keep the text nav even in the
  // native app, since they're not the primary iOS audience.
  const showIOSNav = sysRole === null || sysRole === "TTTStaff" || sysRole === "TTTTeamLead";

  // For non-staff users, build a tenantId→isTTT map server-side so the Header
  // can show/hide the Invoices link without a client-side fetch (avoids timing bugs).
  let tttTenantIds: string[] | undefined;
  let showTips = false; // "Tips" tab: NonTTTClient users only (see lib/tips-access.ts)
  let tenants: Array<Tenant | null> = [];
  if (!isStaff) {
    const memberships = await getMembershipsForUser(userId).catch(() => []);
    if (memberships.length > 0) {
      tenants = await Promise.all(
        memberships.map(m => getTenantById(m.tenantId).catch(() => null))
      );
      tttTenantIds = tenants
        .filter(t => t && t.isTTT === true)
        .map(t => t!.id);
      showTips = isNonTTTClient(sysRole, tenants);
    }
  }

  // Community (white-label) branding: the project's brand for clients and
  // their family, an admin's "View as" preview, or Top Tier by default.
  const brandSlug = (sessionClaims?.public_metadata as { brandSlug?: string } | undefined)?.brandSlug ?? null;
  const resolved = await resolveBrand({ sysRole, tenants, brandSlug });
  const brand = resolved?.brand ?? null;

  return (
    <div className="min-h-screen bg-cream-50">
      {brand && <style dangerouslySetInnerHTML={{ __html: brandCss(brand.primaryColor, brand.secondaryColor) }} />}
      <PushNotificationBootstrap />
      {resolved?.preview && brand && <BrandPreviewBanner name={[brand.displayName, brand.subtitle].filter(Boolean).join(" ")} />}
      <Header
        isManager={isManager} isStaff={isStaff} isAdmin={isAdmin} isSales={isSales} tttTenantIds={tttTenantIds} showIOSNav={showIOSNav} showTips={showTips}
        brand={brand ? { logoUrl: brand.logoUrl, displayName: brand.displayName, primaryColor: brand.primaryColor } : undefined}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      {brand && (
        <p className="text-center text-[11px] text-gray-400 px-4 pb-8 -mt-2">
          {brand.topTierVisibility === "Minimal" ? "Powered by Rightsize" : "Move management by Top Tier Transitions · Powered by Rightsize"}
        </p>
      )}
    </div>
  );
}
