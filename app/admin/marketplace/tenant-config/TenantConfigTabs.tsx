import Link from "next/link";

export function TenantConfigTabs({ active }: { active: "tenants" | "projects" }) {
  const tab = (key: "tenants" | "projects", label: string, href: string) => (
    <Link
      href={href}
      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${active === key ? "bg-forest-600 text-white" : "text-gray-400 hover:text-white"}`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex gap-1 mb-6 border border-gray-800 rounded-xl p-1 w-fit">
      {tab("tenants", "Tenants", "/admin/marketplace/tenant-config")}
      {tab("projects", "Projects", "/admin/marketplace/tenant-config/projects")}
    </div>
  );
}
