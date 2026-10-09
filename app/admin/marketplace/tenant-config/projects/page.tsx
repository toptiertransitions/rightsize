import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { MarketplaceNav } from "../../MarketplaceNav";
import { isTTTAdmin } from "@/lib/config";
import { getAllBrands } from "@/lib/brands/data";
import { getBrandProjectRows } from "@/lib/brands/projects";
import { PREVIEW_COOKIE, verifyValue } from "@/lib/brands/cookies";
import { TenantConfigTabs } from "../TenantConfigTabs";
import { ViewAsSwitcher } from "../ViewAsSwitcher";
import { ProjectsTable } from "./ProjectsTable";

export const dynamic = "force-dynamic";

// Tenant Config > Projects: active projects (not archived, not lost) and
// the community brand each one shows. Gated by the marketplace layout
// (TTTAdmin/TTTManager); "View as this client" is TTTAdmin only, like the
// Users page it reuses.
export default async function TenantConfigProjectsPage() {
  const { userId } = await auth();
  const [rows, brands, jar] = await Promise.all([getBrandProjectRows(), getAllBrands(), cookies()]);
  const brandOptions = brands
    .map((b) => ({ id: b.id, name: [b.displayName, b.subtitle].filter(Boolean).join(" "), status: b.status }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="marketplace" />
      <MarketplaceNav />
      <main className="max-w-7xl mx-auto px-6 pb-12">
        <TenantConfigTabs active="projects" />
        <ViewAsSwitcher brands={brandOptions} current={verifyValue(jar.get(PREVIEW_COOKIE)?.value) ?? ""} />
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">Projects</h1>
          <p className="text-sm text-gray-400 mt-1">
            {rows.length} active projects (not archived, not lost). The brand on a project is what its client and invited family see.
          </p>
        </div>
        <ProjectsTable rows={rows} brands={brandOptions} canImpersonate={!!userId && isTTTAdmin(userId)} />
      </main>
    </div>
  );
}
