"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function PartnerNavLinks() {
  const pathname = usePathname();
  const cls = (active: boolean) =>
    `text-sm font-medium transition-colors ${active ? "text-white" : "text-white/55 hover:text-white"}`;
  return (
    <>
      <Link href="/partner/home" className={cls(pathname === "/partner/home" || pathname === "/partner")}>
        Home
      </Link>
      <Link href="/partner/plans" className={cls(pathname.startsWith("/partner/plan"))}>
        Project Plans
      </Link>
      <Link href="/partner/loyalty" className={cls(pathname === "/partner/loyalty")}>
        Rewards
      </Link>
    </>
  );
}
