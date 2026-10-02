"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { UserButton, useAuth, useClerk, useUser } from "@clerk/nextjs";
import { House, Calendar, LayoutList, Handshake, DollarSign, CircleHelp, Inbox, Bell, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProjectSwitcher } from "@/components/ui/ProjectSwitcher";
import { getPlatform } from "@/lib/native";

const SWITCHER_PAGES = ["/catalog", "/vendors", "/sales", "/invoices", "/quoting", "/plan", "/partners"];
const ALL_PROJECTS_PAGES = ["/catalog", "/plan"];

// iOS native app only (see showIOSNav below) — the full candidate list and
// icons for the compact bottom nav, in display order. Reuses the same
// navLinks entries (same hrefs, same tenant-id query logic) the text nav
// already computes, so routing/behavior is identical — only the UI differs.
// Not every item applies to every role (e.g. Invoices is TTT-client-only,
// Inbox is staff-only) — the render below filters to whichever of these
// actually have a matching navLinks entry for the current user.
const IOS_NAV_ORDER = ["Home", "Plan", "Catalog", "Partners", "Sales", "Invoices", "Inbox"] as const;
const IOS_NAV_ICONS: Record<(typeof IOS_NAV_ORDER)[number], React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  Home: House,
  Plan: Calendar,
  Catalog: LayoutList,
  Partners: Handshake,
  Sales: DollarSign,
  Invoices: Receipt,
  Inbox: Inbox,
};

interface HeaderProps {
  tenantName?: string;
  isImpersonating?: boolean;
  onStopImpersonating?: () => void;
  isManager?: boolean;
  isStaff?: boolean;
  isAdmin?: boolean;
  isSales?: boolean;
  tttTenantIds?: string[]; // non-staff only: tenants where isTTT is true
  // Server-computed: true only for the roles the iOS app's compact icon nav
  // targets (client/TTTStaff/TTTTeamLead). Combined client-side with an
  // actual native-iOS-platform check before the icon nav ever renders —
  // this prop alone is not enough, since it says nothing about web vs. app.
  showIOSNav?: boolean;
}

export function Header({ tenantName, isImpersonating: isImpersonatingProp, onStopImpersonating, isManager, isStaff, isAdmin, isSales, tttTenantIds, showIOSNav }: HeaderProps) {
  // Capacitor's bridge isn't available during SSR/first paint, so this
  // starts false (matching the server-rendered text nav) and flips after
  // mount if we're actually in the native iOS shell — same pattern as
  // every other native-only branch in this codebase (see lib/native.ts).
  const [isIOSNative, setIsIOSNative] = useState(false);
  useEffect(() => {
    setIsIOSNative(getPlatform() === "ios");
  }, []);
  const useIOSNav = !!showIOSNav && isIOSNative;

  // Pending shift-invite count for the badge on the iOS nav's Plan icon.
  // Safe to call unconditionally whenever the iOS nav shows — showIOSNav
  // already scopes to client/TTTStaff/TTTTeamLead (see (protected)/layout.tsx),
  // and the endpoint itself returns an empty list for anyone not eligible.
  const [pendingInviteCount, setPendingInviteCount] = useState(0);
  useEffect(() => {
    if (!useIOSNav) return;
    let cancelled = false;
    fetch("/api/shift-invites/pending")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setPendingInviteCount(d.count ?? 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [useIOSNav]);

  // The fixed bottom nav sits outside normal document flow, so <main>
  // (rendered by the server layout, which has no way to know isIOSNative)
  // needs bottom padding to keep the last bit of page content from sitting
  // underneath it — see the body.ios-bottom-nav rule in globals.css.
  useEffect(() => {
    document.body.classList.toggle("ios-bottom-nav", useIOSNav);
    return () => { document.body.classList.remove("ios-bottom-nav"); };
  }, [useIOSNav]);

  const pathname = usePathname();
  const { actor, userId } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  const isImpersonating = isImpersonatingProp || !!actor;
  const impersonatedName = actor ? (user?.firstName ? [user.firstName, user.lastName].filter(Boolean).join(" ") : user?.emailAddresses?.[0]?.emailAddress ?? "user") : undefined;
  const showSwitcher = isStaff && SWITCHER_PAGES.some((p) => pathname.startsWith(p));
  const allowAllProjects = ALL_PROJECTS_PAGES.some((p) => pathname.startsWith(p));
  const searchParams = useSearchParams();
  const urlTenantId = searchParams.get("tenantId");

  // If a different account signs in on this browser than the one that last
  // left a tenantId here (or none did before), drop the stale value — it
  // points at someone else's project. Nav links would otherwise carry it
  // straight through, the server would correctly reject it as unrelated to
  // the new user, and every tab (Plan, Catalog, ...) would silently bounce
  // back to Home with no visible error.
  useEffect(() => {
    if (!userId) return;
    try {
      const lastUserId = localStorage.getItem("rz_lastUserId");
      if (lastUserId !== userId) {
        localStorage.removeItem("rz_tenantId");
        localStorage.setItem("rz_lastUserId", userId);
      }
    } catch {}
  }, [userId]);

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

  const isVendorPortal = pathname === "/vendor" || pathname.startsWith("/vendor/");

  // Sales users see CRM + Outreach + Expenses + Quoting + Invoices
  const salesOnlyLinks = [
    { href: "/quoting", base: "/quoting", label: "Quoting" },
    { href: "/invoices", base: "/invoices", label: "Invoices" },
    { href: "/crm", base: "/crm", label: "CRM", excludeBase: "/crm/outreach" },
    { href: "/crm/outreach", base: "/crm/outreach", label: "Outreach" },
    { href: "/expenses", base: "/expenses", label: "Expenses" },
    { href: "/inbox", base: "/inbox", label: "Inbox" },
  ];

  const navLinks = isVendorPortal ? [] : isSales ? salesOnlyLinks : [
    { href: "/home", label: "Home" },
    { href: `/plan${isStaff ? staffPlanTq : tq}`, base: "/plan", label: "Plan" },
    { href: `/catalog${tq}`, base: "/catalog", label: "Catalog" },
    { href: `/partners${tq}`, base: "/partners", label: "Partners" },
    { href: `/sales${tq}`, base: "/sales", label: "Sales" },
    // Quoting — Manager and Admin; carry current project if one is selected
    ...(isManager ? [{ href: `/quoting${projectTq}`, base: "/quoting", label: "Quoting" }] : []),
    // Invoices — TTT clients (non-staff) only; tttTenantIds is server-determined
    ...(navTenantId && !isStaff && tttTenantIds?.includes(navTenantId) ? [{ href: `/invoices${tq}`, base: "/invoices", label: "Invoices" }] : []),
    ...(isManager ? [{ href: `/invoices${projectTq}`, base: "/invoices", label: "Invoices" }] : []),
    // CRM + Outreach — Admin only
    ...(isAdmin ? [
      { href: "/crm", base: "/crm", label: "CRM", excludeBase: "/crm/outreach" },
      { href: "/crm/outreach", base: "/crm/outreach", label: "Outreach" },
    ] : []),
    // Expenses — Staff, Manager, and Admin
    ...((isManager || isStaff) ? [{ href: "/expenses", base: "/expenses", label: "Expenses" }] : []),
    // Ops — Manager, Admin, and Sales
    ...((isManager || isSales) ? [{ href: "/staff", base: "/staff", label: "Ops" }] : []),
    // Inbox — internal comms hub: Staff, TeamLead, Manager, and Admin only
    // (Sales gets it via salesOnlyLinks above). Never shown to clients —
    // the page itself redirects them to /home even if they reach the URL.
    ...(isStaff ? [{ href: "/inbox", base: "/inbox", label: "Inbox" }] : []),
  ];

  // iOS compact nav only ever shows a subset of IOS_NAV_ORDER for a given
  // role (e.g. clients never get Inbox) — filter down first so the grid
  // sizes itself to however many icons actually apply, instead of leaving
  // a dead column where a skipped item used to sit.
  const iosNavLinks = IOS_NAV_ORDER
    .map((label) => ({ label, link: navLinks.find((l) => l.label === label) }))
    .filter((item): item is { label: (typeof IOS_NAV_ORDER)[number]; link: NonNullable<typeof item.link> } => !!item.link);

  return (
    <>
    <header className="sticky top-0 z-50 bg-white border-b border-cream-200 shadow-sm" style={{ paddingTop: "var(--sat)" }}>
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

          {/* Nav — hidden entirely in the iOS native compact nav (below) */}
          {!useIOSNav && (
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    pathname.startsWith(link.base ?? link.href) && !(link.excludeBase && pathname.startsWith(link.excludeBase))
                      ? "bg-forest-50 text-forest-700"
                      : "text-gray-600 hover:text-forest-700 hover:bg-gray-50"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}

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
            >
              <UserButton.MenuItems>
                <UserButton.Action label="manageAccount" />
                <UserButton.Link label="Get Help" href="/help" labelIcon={<CircleHelp className="w-4 h-4" />} />
                {isIOSNative && (
                  <UserButton.Link label="Notifications" href="/notification-settings" labelIcon={<Bell className="w-4 h-4" />} />
                )}
                <UserButton.Action label="signOut" />
              </UserButton.MenuItems>
            </UserButton>
          </div>
        </div>

        {/* Mobile nav (web/browser only) */}
        {!useIOSNav && (
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
        )}
      </div>
    </header>

    {/* iOS native app nav — replaces the text nav above for client/TTTStaff/TTTTeamLead.
        Fixed to the bottom (not part of <header>) so vertical scrolling never hides it;
        <main>'s bottom padding for this lives in globals.css (body.ios-bottom-nav). */}
    {useIOSNav && (
      <nav
        className="fixed inset-x-0 bottom-0 z-50 grid bg-white border-t border-cream-200"
        style={{ paddingBottom: "var(--sab)", gridTemplateColumns: `repeat(${iosNavLinks.length}, minmax(0, 1fr))` }}
      >
        {iosNavLinks.map(({ label, link }) => {
          const Icon = IOS_NAV_ICONS[label];
          const isActive = pathname.startsWith(link.base ?? link.href) && !(link.excludeBase && pathname.startsWith(link.excludeBase));
          return (
            <Link
              key={label}
              href={link.href}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] py-1.5 transition-colors",
                isActive ? "text-forest-700" : "text-gray-500"
              )}
            >
              <span className="relative">
                <Icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.5 : 1.75} />
                {label === "Plan" && pendingInviteCount > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                    {pendingInviteCount > 9 ? "9+" : pendingInviteCount}
                  </span>
                )}
              </span>
              <span className="text-[10px] leading-none font-medium whitespace-nowrap">{label}</span>
            </Link>
          );
        })}
      </nav>
    )}
    </>
  );
}
