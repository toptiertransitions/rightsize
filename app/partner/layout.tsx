import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { UserButton } from "@clerk/nextjs";
import { getPartnerContact } from "@/lib/partner";
import { PartnerNavLinks } from "./PartnerNavLinks";

export const metadata = { title: "Partner Portal — Top Tier Transitions" };

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const contact = await getPartnerContact(userId);
  if (!contact) redirect("/home");

  return (
    <div className="min-h-screen bg-cream-50">
      <header className="sticky top-0 z-50 bg-white border-b border-cream-200 shadow-sm" style={{ paddingTop: "var(--sat)" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link href="/partner/home" className="flex items-center gap-2.5 shrink-0">
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

            {/* Nav */}
            <nav className="hidden md:flex items-center gap-1">
              <PartnerNavLinks />
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-3">
              <span className="hidden sm:block text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-200">
                {contact.name}
              </span>
              <UserButton appearance={{ elements: { avatarBox: "w-9 h-9" } }} />
            </div>
          </div>

          {/* Mobile nav */}
          <div className="flex md:hidden pb-3 gap-1 overflow-x-auto">
            <PartnerNavLinks mobile />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
