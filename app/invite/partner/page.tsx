import Link from "next/link";
import Image from "next/image";
import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { IOS_APP_STORE_ID } from "@/lib/ios-app";
import { PartnerInviteActions } from "./PartnerInviteActions";

// Landing page for the marketplace partner invite email's "Get Started"
// button. It lives under /invite so Universal Links open it straight in the
// Rightsize app when it's installed (see app/.well-known/
// apple-app-site-association); in Safari, the Smart App Banner offers the
// app instead. Either way it leads to the same sign-up, with the invited
// email filled in, ending at /api/partner/activate.

interface PageProps {
  searchParams: Promise<{ email?: string }>;
}

const ACTIVATE = "/api/partner/activate";

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { email } = await searchParams;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
  const arg = `${appUrl}/invite/partner${email ? `?email=${encodeURIComponent(email)}` : ""}`;
  return {
    title: "Join the Top Tier partner network",
    robots: "noindex, nofollow",
    other: { "apple-itunes-app": `app-id=${IOS_APP_STORE_ID}, app-argument=${arg}` },
  };
}

export default async function PartnerInvitePage({ searchParams }: PageProps) {
  const { email } = await searchParams;
  const { userId } = await auth();
  const emailParam = email ? `&email=${encodeURIComponent(email)}` : "";
  const signUpHref = `/sign-up?redirect_url=${encodeURIComponent(ACTIVATE)}${emailParam}`;
  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(ACTIVATE)}`;
  const likelyIos = /iPhone|iPad|iPod|Macintosh/.test((await headers()).get("user-agent") ?? "");

  return (
    <div className="min-h-[100dvh] bg-cream-50 flex items-center justify-center px-4 py-10">
      <div className="bg-white rounded-2xl shadow-lg border border-cream-200 w-full max-w-md p-8">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 mx-auto">
          <Image src="/ttt-icon.png" alt="Top Tier Transitions" width={56} height={56} className="w-14 h-14 object-contain" priority />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">Join our partner network</h1>
        <p className="text-gray-500 text-center mb-6 leading-relaxed">
          Create your Rightsize partner account, tell us about your business, and we&apos;ll match you with families who need what you offer.
        </p>

        {userId ? (
          <a
            href={ACTIVATE}
            className="flex items-center justify-center w-full h-12 px-5 bg-forest-600 text-white rounded-xl font-semibold text-base hover:bg-forest-700 transition-colors"
          >
            Continue to setup
          </a>
        ) : (
          <PartnerInviteActions signUpHref={signUpHref} signInHref={signInHref} email={email} likelyIos={likelyIos} />
        )}
      </div>
    </div>
  );
}
