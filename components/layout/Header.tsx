"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";

interface HeaderProps {
  tenantName?: string;
  isImpersonating?: boolean;
  onStopImpersonating?: () => void;
}

export function Header({ tenantName, isImpersonating, onStopImpersonating }: HeaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId");
  const tq = tenantId ? `?tenantId=${tenantId}` : "";

  const navLinks = [
    { href: "/dashboard", label: "Dashboard" },
    { href: `/rooms${tq}`, base: "/rooms", label: "Rooms" },
    { href: `/catalog${tq}`, base: "/catalog", label: "Catalog" },
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
            <span>TTT Staff View — {tenantName}</span>
          </div>
          <button
            onClick={onStopImpersonating}
            className="underline hover:no-underline ml-4"
          >
            Exit to Admin
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2.5">
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
            {tenantName && (
              <span className="hidden sm:block text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full border">
                {tenantName}
              </span>
            )}
            <UserButton
              afterSignOutUrl="/sign-in"
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
