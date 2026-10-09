import Link from "next/link";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { MarketplaceNav } from "../MarketplaceNav";
import { getAllPartners } from "@/lib/marketplace/data";
import { getTenants, getMembershipsForTenant } from "@/lib/airtable";
import { getAllBrands } from "@/lib/brands/data";
import { TenantConfigTabs } from "./TenantConfigTabs";
import { EnableBrandForm } from "./EnableBrandForm";
import { ViewAsSwitcher } from "./ViewAsSwitcher";
import { cookies } from "next/headers";
import { PREVIEW_COOKIE, verifyValue } from "@/lib/brands/cookies";

export const dynamic = "force-dynamic";

// Tenant Config > Tenants: every community brand, plus "Enable tenant
// branding" for marketplace partners that don't have one yet. Access is
// gated by the marketplace layout (TTTAdmin/TTTManager) and re-checked in
// every action.
export default async function TenantConfigPage() {
  const [brands, partners, tenants] = await Promise.all([getAllBrands(), getAllPartners(), getTenants()]);

  // Linked users = members of projects assigned to each brand
  const branded = tenants.filter((t) => t.communityBrandId);
  const memberCounts = await Promise.all(branded.map((t) => getMembershipsForTenant(t.id).then((m) => m.length).catch(() => 0)));
  const usersByBrand = new Map<string, number>();
  const projectsByBrand = new Map<string, number>();
  branded.forEach((t, i) => {
    usersByBrand.set(t.communityBrandId!, (usersByBrand.get(t.communityBrandId!) ?? 0) + memberCounts[i]);
    projectsByBrand.set(t.communityBrandId!, (projectsByBrand.get(t.communityBrandId!) ?? 0) + 1);
  });

  const previewId = verifyValue((await cookies()).get(PREVIEW_COOKIE)?.value) ?? "";
  const brandOptions = brands
    .map((b) => ({ id: b.id, name: [b.displayName, b.subtitle].filter(Boolean).join(" "), status: b.status }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const partnerName = new Map(partners.map((p) => [p.id, p.companyName]));
  const withBrand = new Set(brands.map((b) => b.marketplacePartnerId));
  const available = partners
    .filter((p) => !withBrand.has(p.id) && p.lifecycleStatus !== "Archived")
    .map((p) => ({ id: p.id, name: p.companyName }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="marketplace" />
      <MarketplaceNav />
      <main className="max-w-7xl mx-auto px-6 pb-12">
        <TenantConfigTabs active="tenants" />
        <ViewAsSwitcher brands={brandOptions} current={previewId} />
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Tenants</h1>
            <p className="text-sm text-gray-400 mt-1">White-label branding for communities. Clients on a branded project, and their family, see the community&apos;s logo, colors, and contacts.</p>
          </div>
          <EnableBrandForm partners={available} />
        </div>

        {brands.length === 0 ? (
          <p className="text-sm text-gray-500 bg-gray-900 border border-gray-800 rounded-xl p-6">No tenants yet. Enable branding for a partner to get started.</p>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-800">
                <tr>
                  <th className="text-left px-4 py-3">Community</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Slug / Code</th>
                  <th className="text-right px-4 py-3">Projects</th>
                  <th className="text-right px-4 py-3">Linked users</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {brands.sort((a, b) => a.displayName.localeCompare(b.displayName)).map((b) => (
                  <tr key={b.id} className="hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/marketplace/tenant-config/${b.id}`} className="flex items-center gap-3">
                        <span className="w-9 h-9 rounded-lg bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                          {b.logoUrl
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={b.logoUrl} alt="" className="max-w-full max-h-full object-contain" />
                            : <span className="text-xs font-bold" style={{ color: b.primaryColor }}>{b.displayName.slice(0, 2)}</span>}
                        </span>
                        <span>
                          <span className="block font-medium text-white">{[b.displayName, b.subtitle].filter(Boolean).join(" ")}</span>
                          <span className="block text-xs text-gray-500">{partnerName.get(b.marketplacePartnerId) ?? "Partner not found"}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${b.status === "Active" ? "bg-green-900/40 text-green-300" : "bg-gray-800 text-gray-400"}`}>{b.status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      <span className="font-mono text-xs">{b.slug}</span>
                      <span className="text-gray-600"> · </span>
                      <span className="font-mono text-xs">{b.communityCode}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300 tabular-nums">{projectsByBrand.get(b.id) ?? 0}</td>
                    <td className="px-4 py-3 text-right text-gray-300 tabular-nums">{usersByBrand.get(b.id) ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
