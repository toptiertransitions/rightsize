"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/partner/home", label: "Home", isActive: (p: string) => p === "/partner/home" || p === "/partner" },
  { href: "/partner/plans", label: "Project Plans", isActive: (p: string) => p.startsWith("/partner/plan") },
  { href: "/partner/loyalty", label: "Rewards", isActive: (p: string) => p === "/partner/loyalty" },
  { href: "/partner/documents", label: "Documents", isActive: (p: string) => p.startsWith("/partner/documents") },
];

const LISTING_ITEM = { href: "/partner/listing", label: "My Listing", isActive: (p: string) => p.startsWith("/partner/listing") };
const LEADS_ITEM = { href: "/partner/leads", label: "Leads", isActive: (p: string) => p.startsWith("/partner/leads") };

export function PartnerNavLinks({ mobile = false, hasListing = false }: { mobile?: boolean; hasListing?: boolean }) {
  const pathname = usePathname();
  const items = hasListing ? [NAV_ITEMS[0], LEADS_ITEM, LISTING_ITEM, ...NAV_ITEMS.slice(1)] : NAV_ITEMS;

  return (
    <>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "font-medium transition-colors whitespace-nowrap",
            mobile ? "px-3 py-1.5 rounded-lg text-sm" : "px-4 py-2 rounded-lg text-sm",
            item.isActive(pathname)
              ? "bg-forest-50 text-forest-700"
              : "text-gray-600 hover:text-forest-700 hover:bg-gray-50"
          )}
        >
          {item.label}
        </Link>
      ))}
    </>
  );
}
