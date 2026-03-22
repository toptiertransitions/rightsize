"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

type AdminTab =
  | "projects"
  | "users"
  | "local-vendors"
  | "routing-rules"
  | "bulk-upload"
  | "contract-services"
  | "invoicing"
  | "expenses"
  | "drips"
  | "pfinventory"
  | "fb"
  | "ebay"
  | "crm"
  | "ops";

const NAV_LINKS: { tab: AdminTab; label: string; href: string }[] = [
  { tab: "projects", label: "Home", href: "/admin" },
  { tab: "users", label: "Users", href: "/admin/users" },
  { tab: "local-vendors", label: "Vendors", href: "/admin/local-vendors" },
  { tab: "routing-rules", label: "Routing", href: "/admin/routing-rules" },
  { tab: "bulk-upload", label: "CSVs", href: "/admin/integrations/circle-hand" },
  { tab: "contract-services", label: "Contracts", href: "/admin/contract-services" },
  { tab: "invoicing", label: "Invoicing", href: "/admin/invoicing" },
  { tab: "expenses", label: "Expenses", href: "/admin/expenses" },
  { tab: "drips", label: "Drips", href: "/admin/drips" },
  { tab: "pfinventory", label: "PF Inventory", href: "/admin/pfinventory" },
  { tab: "fb", label: "FB", href: "/admin/fb" },
  { tab: "ebay", label: "eBay", href: "/admin/ebay" },
  { tab: "crm", label: "CRM", href: "/admin/crm" },
  { tab: "ops", label: "Ops", href: "/admin/ops" },
];

interface AdminHeaderProps {
  active: AdminTab;
}

export function AdminHeader({ active }: AdminHeaderProps) {
  return (
    <header className="border-b border-gray-800 bg-gray-900">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-forest-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <div>
              <div className="font-bold text-white text-sm">Rightsize</div>
              <div className="text-[9px] text-gray-400">TTT Admin Console</div>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ tab, label, href }) => (
              <Link
                key={tab}
                href={href}
                className={
                  active === tab
                    ? "px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-white font-medium"
                    : "px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                }
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs bg-red-900/50 text-red-400 border border-red-800 px-3 py-1 rounded-full font-medium">
            Admin
          </span>
          <UserButton  />
        </div>
      </div>
    </header>
  );
}
