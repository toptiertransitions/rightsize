import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { getPartnerContact } from "@/lib/partner";

export const metadata = { title: "Partner Portal — Top Tier Transitions" };

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const contact = await getPartnerContact(userId);
  if (!contact) redirect("/home");

  return (
    <div className="min-h-screen bg-[#f0f4f0]">
      {/* Top nav */}
      <header className="bg-[#2d4a3e] text-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/partner/home" className="text-base font-semibold tracking-tight hover:opacity-80 transition-opacity">
              TTT Partner Portal
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/70 hidden sm:block">{contact.name}</span>
            <SignOutButton>
              <button className="text-sm text-white/60 hover:text-white transition-colors">
                Sign out
              </button>
            </SignOutButton>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
