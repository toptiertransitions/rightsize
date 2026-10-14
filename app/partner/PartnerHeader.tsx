"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { House, Calendar, Gift, FileText, Store, Inbox, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPlatform } from "@/lib/native";
import { PartnerNavLinks } from "./PartnerNavLinks";

// iOS native app only — the four items and their icons the compact bottom
// nav shows, in display order. Same hrefs/active-match logic as
// PartnerNavLinks (the web text nav), so routing is identical — only the
// UI differs. Every Partner Portal user gets this nav on iOS; unlike the
// NonTTTClient compact nav there's no separate role check needed here,
// since app/partner/layout.tsx already redirects anyone who isn't a
// referral partner before this component ever renders.
const PARTNER_IOS_NAV_ITEMS = [
  { href: "/partner/home", label: "Home", Icon: House, isActive: (p: string) => p === "/partner/home" || p === "/partner" },
  { href: "/partner/plans", label: "Project Plans", Icon: Calendar, isActive: (p: string) => p.startsWith("/partner/plan") },
  { href: "/partner/loyalty", label: "Rewards", Icon: Gift, isActive: (p: string) => p === "/partner/loyalty" },
  { href: "/partner/documents", label: "Documents", Icon: FileText, isActive: (p: string) => p.startsWith("/partner/documents") },
];

// Marketplace partners only (see app/partner/layout.tsx)
const LISTING_NAV_ITEM = { href: "/partner/listing", label: "Listing", Icon: Store, isActive: (p: string) => p.startsWith("/partner/listing") };
const LEADS_NAV_ITEM = { href: "/partner/leads", label: "Leads", Icon: Inbox, isActive: (p: string) => p.startsWith("/partner/leads") };
const TEAM_NAV_ITEM = { href: "/partner/team", label: "Team", Icon: Users, isActive: (p: string) => p.startsWith("/partner/team") };

export function PartnerHeader({ contactName, hasListing = false, hasCrm = true, isCommunity = false }: { contactName: string; hasListing?: boolean; hasCrm?: boolean; isCommunity?: boolean }) {
  const pathname = usePathname();
  // Marketplace partners get Leads and Listing too (6 items), with shorter
  // labels so all six fit on a phone; other partners keep the original 4.
  // Team members without CRM access get just Leads, Listing and Team. When
  // all six are showing, Team moves to a header button.
  const iosItems = hasListing && hasCrm
    ? [
        PARTNER_IOS_NAV_ITEMS[0],
        LEADS_NAV_ITEM,
        LISTING_NAV_ITEM,
        { ...PARTNER_IOS_NAV_ITEMS[1], label: isCommunity ? "Residents" : "Plans" },
        PARTNER_IOS_NAV_ITEMS[2],
        { ...PARTNER_IOS_NAV_ITEMS[3], label: "Docs" },
      ]
    : hasListing
      ? isCommunity
        ? [LEADS_NAV_ITEM, LISTING_NAV_ITEM, { ...PARTNER_IOS_NAV_ITEMS[1], label: "Residents" }, TEAM_NAV_ITEM]
        : [LEADS_NAV_ITEM, LISTING_NAV_ITEM, TEAM_NAV_ITEM]
      : PARTNER_IOS_NAV_ITEMS;
  const teamInHeader = hasListing && hasCrm;
  const gridCols = iosItems.length === 6 ? "grid-cols-6" : iosItems.length === 3 ? "grid-cols-3" : "grid-cols-4";

  // Capacitor's bridge isn't available during SSR/first paint, so this
  // starts false (matching the server-rendered text nav) and flips after
  // mount if we're actually in the native iOS shell — same pattern as the
  // NonTTTClient iOS nav in components/layout/Header.tsx.
  const [isIOSNative, setIsIOSNative] = useState(false);
  useEffect(() => {
    setIsIOSNative(getPlatform() === "ios");
  }, []);

  // The fixed bottom nav sits outside normal document flow, so <main>
  // needs bottom padding to keep page content from sitting underneath it —
  // reuses the same body.ios-bottom-nav rule in globals.css the
  // NonTTTClient nav already relies on.
  useEffect(() => {
    document.body.classList.toggle("ios-bottom-nav", isIOSNative);
    return () => { document.body.classList.remove("ios-bottom-nav"); };
  }, [isIOSNative]);

  return (
    <>
      <header className="sticky top-0 z-50 bg-white border-b border-cream-200 shadow-sm" style={{ paddingTop: "var(--sat)" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link href={hasCrm ? "/partner/home" : "/partner/leads"} className="flex items-center gap-2.5 shrink-0">
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
                <div className="text-[10px] text-gray-400 leading-none">Partner Portal</div>
              </div>
            </Link>

            {/* Nav — hidden entirely in the iOS native compact nav (below) */}
            {!isIOSNative && (
              <nav className="hidden md:flex items-center gap-1">
                <PartnerNavLinks hasListing={hasListing} hasCrm={hasCrm} isCommunity={isCommunity} />
              </nav>
            )}

            {/* Right side */}
            <div className="flex items-center gap-3">
              <span className="hidden sm:block text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-200">
                {contactName}
              </span>
              {isIOSNative && teamInHeader && (
                <Link
                  href="/partner/team"
                  aria-label="Team"
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center border transition-colors",
                    pathname.startsWith("/partner/team") ? "bg-forest-50 border-forest-200 text-forest-700" : "border-gray-200 text-gray-500"
                  )}
                >
                  <Users className="w-[18px] h-[18px]" />
                </Link>
              )}
              <UserButton appearance={{ elements: { avatarBox: "w-9 h-9" } }} />
            </div>
          </div>

          {/* Mobile nav (web/browser only) */}
          {!isIOSNative && (
            <div className="flex md:hidden pb-3 gap-1 overflow-x-auto">
              <PartnerNavLinks mobile hasListing={hasListing} hasCrm={hasCrm} isCommunity={isCommunity} />
            </div>
          )}
        </div>
      </header>

      {/* iOS native app nav — replaces the text nav above for Partner Portal users */}
      {isIOSNative && (
        <nav
          className={cn("fixed inset-x-0 bottom-0 z-50 grid bg-white border-t border-cream-200", gridCols)}
          style={{ paddingBottom: "var(--sab)" }}
        >
          {iosItems.map(({ href, label, Icon, isActive }) => {
            const active = isActive(pathname);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 min-h-[44px] py-1.5 transition-colors",
                  active ? "text-forest-700" : "text-gray-500"
                )}
              >
                <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.5 : 1.75} />
                <span className="text-[10px] leading-none font-medium whitespace-nowrap">{label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
