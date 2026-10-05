"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/marketplace", label: "Dashboard", exact: true },
  { href: "/admin/marketplace/partners", label: "Partners" },
  { href: "/admin/marketplace/categories", label: "Categories" },
  { href: "/admin/marketplace/pipeline", label: "Pipeline" },
];

export function MarketplaceNav() {
  const pathname = usePathname();
  return (
    <div className="max-w-7xl mx-auto px-6 pt-8">
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname?.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                active ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
