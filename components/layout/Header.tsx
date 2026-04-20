"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { UserButton, useAuth, useClerk, useUser } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { ProjectSwitcher } from "@/components/ui/ProjectSwitcher";

const SWITCHER_PAGES = ["/catalog", "/vendors", "/sales", "/invoices", "/quoting", "/plan"];
const ALL_PROJECTS_PAGES = ["/catalog", "/plan"];

interface HeaderProps {
  tenantName?: string;
  isImpersonating?: boolean;
  onStopImpersonating?: () => void;
  isManager?: boolean;
  isStaff?: boolean;
  isAdmin?: boolean;
  isSales?: boolean;
}

export function Header({ tenantName, isImpersonating: isImpersonatingProp, onStopImpersonating, isManager, isStaff, isAdmin, isSales }: HeaderProps) {
  const pathname = usePathname();
  const { actor } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  const isImpersonating = isImpersonatingProp || !!actor;
  const impersonatedName = actor ? (user?.firstName ? [user.firstName, user.lastName].filter(Boolean).join(" ") : user?.emailAddresses?.[0]?.emailAddress ?? "user") : undefined;
  const showSwitcher = isStaff && SWITCHER_PAGES.some((p) => pathname.startsWith(p));
  const allowAllProjects = ALL_PROJECTS_PAGES.some((p) => pathname.startsWith(p));
  const searchParams = useSearchParams();
  const urlTenantId = searchParams.get("tenantId");

  // Persist the last known real tenantId (never sentinels) so nav links survive
  // navigating to pages that don't carry ?tenantId= (e.g. /crm, /home).
  const [persistedTenantId, setPersistedTenantId] = useState<string | null>(null);
  useEffect(() => {
    if (urlTenantId && !urlTenantId.startsWith("__all_")) {
      try { localStorage.setItem("rz_tenantId", urlTenantId); } catch {}
      setPersistedTenantId(urlTenantId);
    } else if (!urlTenantId) {
      try { setPersistedTenantId(localStorage.getItem("rz_tenantId")); } catch {}
    }
    // Sentinels (__all_*) are NOT stored so they don't leak to other pages
  }, [urlTenantId]);

  const tenantId = urlTenantId ?? persistedTenantId;
  // For nav links, always use the real (non-sentinel) tenantId
  const isSentinel = urlTenantId?.startsWith("__all_") ?? false;
  const navTenantId = isSentinel ? persistedTenantId : tenantId;
  const tq = navTenantId ? `?tenantId=${navTenantId}` : "";

  // For staff, the Plan link only carries a tenantId when one is present in the
  // *current* URL — so /home → Plan defaults to All My Projects (toggle ON),
  // while /catalog?tenantId=X → Plan keeps the same project (toggle OFF).
  const staffPlanTq = (isStaff && urlTenantId && !isSentinel)
    ? `?tenantId=${urlTenantId}`
    : (isAdmin || isManager)
    ? `?tenantId=__all_active__`
    : "";

  // For Quoting / Invoices (admin + manager): carry the project from the current URL only.
  // Arriving from CRM or Home (no tenantId in URL) shows the project picker.
  // Arriving from Catalog/Vendors/Sales/etc. with a project pre-selected keeps it.
  const projectTq = (urlTenantId && !isSentinel) ? `?tenantId=${urlTenantId}` : "";

  // Determine if the current tenant is a TTT project (for Invoices nav visibility).
  // Default null = hidden; set to true only when confirmed. LocalStorage cache avoids flash on repeat visits.
  const [isTTTTenant, setIsTTTTenant] = useState<boolean | null>(null);
  useEffect(() => {
    if (!navTenantId || isStaff) { setIsTTTTenant(null); return; }
    // Read cache first so TTT clients don't see the link flash in
    try {
      const cached = localStorage.getItem(`rz_isTTT_${navTenantId}`);
      if (cached !== null) setIsTTTTenant(cached === "1");
    } catch {}
    fetch(`/api/tenants/${navTenantId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const val = (d.isTTT ?? true) as boolean;
        setIsTTTTenant(val);
        try { localStorage.setItem(`rz_isTTT_${navTenantId}`, val ? "1" : "0"); } catch {}
      })
      .catch(() => {});
  }, [navTenantId, isStaff]);

  const isVendorPortal = pathname === "/vendor" || pathname.startsWith("/vendor/");

  // Sales users see CRM + Drips + Expenses + Quoting + Invoices
  const salesOnlyLinks = [
    { href: "/quoting", base: "/quoting", label: "Quoting" },
    { href: "/invoices", base: "/invoices", label: "Invoices" },
    { href: "/crm", base: "/crm", label: "CRM" },
    { href: "/crm/drips", base: "/crm/drips", label: "Drips" },
    { href: "/expenses", base: "/expenses", label: "Expenses" },
    { href: "/help", base: "/help", label: "Help" },
  ];

  const navLinks = isVendorPortal ? [] : isSales ? salesOnlyLinks : [
    { href: "/home", label: "Home" },
    { href: `/plan${isStaff ? staffPlanTq : tq}`, base: "/plan", label: "Plan" },
    { href: `/catalog${tq}`, base: "/catalog", label: "Catalog" },
    { href: `/vendors${tq}`, base: "/vendors", label: "Vendors" },
    { href: `/sales${tq}`, base: "/sales", label: "Sales" },
    // Quoting — Manager and Admin; carry current project if one is selected
    ...(isManager ? [{ href: `/quoting${projectTq}`, base: "/quoting", label: "Quoting" }] : []),
    // Invoices — TTT clients (non-staff) only; hidden until fetch confirms isTTT=true
    ...(navTenantId && !isStaff && isTTTTenant === true ? [{ href: `/invoices${tq}`, base: "/invoices", label: "Invoices" }] : []),
    ...(isManager ? [{ href: `/invoices${projectTq}`, base: "/invoices", label: "Invoices" }] : []),
    // CRM + Drips — Admin only
    ...(isAdmin ? [
      { href: "/crm", base: "/crm", label: "CRM" },
      { href: "/crm/drips", base: "/crm/drips", label: "Drips" },
    ] : []),
    // Expenses — Staff, Manager, and Admin
    ...((isManager || isStaff) ? [{ href: "/expenses", base: "/expenses", label: "Expenses" }] : []),
    // Ops — Manager, Admin, and Sales
    ...((isManager || isSales) ? [{ href: "/staff", base: "/staff", label: "Ops" }] : []),
    { href: "/help", base: "/help", label: "Help" },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-cream-200 shadow-sm">
      {/* Impersonation Banner */}
      {isImpersonating && (
        <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between text-sm font-medium">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span>Viewing as {impersonatedName ?? tenantName ?? "user"}</span>
          </div>
          <button
            onClick={actor ? () => signOut({ redirectUrl: "/admin/users" }) : onStopImpersonating}
            className="underline hover:no-underline ml-4"
          >
            Exit to Admin
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/home" className="flex items-center gap-2.5">
            <Image
              src="/ttt-icon.png"
              alt="Top Tier Transitions"
              width={36}
              height={36}
              className="w-9 h-9 object-contain"
              priority
            />
            <div>
              <div className="font-bold text-forest-700 leading-none text-sm">Rightsize</div>
              <div className="text-[10px] text-gray-400 leading-none">by Top Tier</div>
            </div>
          </Link>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  pathname.startsWith(link.base ?? link.href)
                    ? "bg-forest-50 text-forest-700"
                    : "text-gray-600 hover:text-forest-700 hover:bg-gray-50"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {showSwitcher ? (
              <ProjectSwitcher currentTenantId={tenantId} allowAllProjects={allowAllProjects} />
            ) : tenantName ? (
              <span className="hidden sm:block text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full border">
                {tenantName}
              </span>
            ) : null}
            <UserButton
              
              appearance={{
                elements: {
                  avatarBox: "w-9 h-9",
                },
              }}
            />
          </div>
        </div>

        {/* Mobile nav */}
        <div className="flex md:hidden pb-3 gap-1 overflow-x-auto">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                pathname.startsWith(link.base ?? link.href)
                  ? "bg-forest-50 text-forest-700"
                  : "text-gray-600 hover:text-forest-700"
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
