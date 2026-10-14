import Image from "next/image";
import { auth, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { IOS_APP_STORE_ID } from "@/lib/ios-app";
import { getPartnerUserByToken } from "@/lib/marketplace/partnerUsersData";
import { getPartnerById } from "@/lib/marketplace/data";
import { isInviteExpired } from "@/lib/marketplace/team";
import { PartnerInviteActions } from "../../partner/PartnerInviteActions";
import { AcceptTeamInvite } from "./AcceptTeamInvite";

// Landing page for a partner company team invitation. Under /invite so it
// opens in the Rightsize app when installed (Universal Links). Signing up
// or in returns here, where the invitee accepts.

interface PageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
  return {
    title: "Join your team on Rightsize",
    robots: "noindex, nofollow",
    other: { "apple-itunes-app": `app-id=${IOS_APP_STORE_ID}, app-argument=${appUrl}/invite/team/${token}` },
  };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-cream-50 flex items-center justify-center px-4 py-10">
      <div className="bg-white rounded-2xl shadow-lg border border-cream-200 w-full max-w-md p-8">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 mx-auto">
          <Image src="/ttt-icon.png" alt="Top Tier Transitions" width={56} height={56} className="w-14 h-14 object-contain" priority />
        </div>
        {children}
      </div>
    </div>
  );
}

export default async function TeamInvitePage({ params }: PageProps) {
  const { token } = await params;
  const invite = await getPartnerUserByToken(token).catch(() => null);
  const partner = invite ? await getPartnerById(invite.partnerId).catch(() => null) : null;

  if (!invite || !partner || invite.status !== "Invited") {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-gray-900 text-center mb-2">This invitation isn&rsquo;t active</h1>
        <p className="text-gray-500 text-center leading-relaxed">
          It may have been accepted already, cancelled, or replaced by a newer invitation. If you&rsquo;ve already joined, just sign in.
        </p>
        <a href="/sign-in?redirect_url=%2Fpartner%2Fhome" className="mt-6 flex items-center justify-center w-full h-12 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50">
          Sign in
        </a>
      </Shell>
    );
  }

  if (isInviteExpired(invite)) {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-gray-900 text-center mb-2">This invitation has expired</h1>
        <p className="text-gray-500 text-center leading-relaxed">
          Ask {invite.invitedByName || "whoever invited you"} to send a new one from their Team page.
        </p>
      </Shell>
    );
  }

  const { userId } = await auth();
  const back = `/invite/team/${token}`;
  const roleText = invite.role === "Primary" ? "as the account owner" : "as a team member";

  let signedInAs = "";
  if (userId) {
    const user = await currentUser().catch(() => null);
    const verified = user?.emailAddresses.filter((e) => e.verification?.status === "verified").map((e) => e.emailAddress) ?? [];
    signedInAs = verified.find((e) => e.toLowerCase() === invite.email) ?? user?.primaryEmailAddress?.emailAddress ?? verified[0] ?? "";
  }

  return (
    <Shell>
      <p className="text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-forest-600 mb-2">Partner account invitation</p>
      <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">Join {partner.companyName}</h1>
      <p className="text-gray-500 text-center mb-6 leading-relaxed">
        {invite.invitedByName ? <><span className="font-medium text-gray-700">{invite.invitedByName}</span> invited you</> : "You've been invited"} {roleText}. You&rsquo;ll see new client leads, keep your listing current, and work alongside your team.
      </p>

      {userId ? (
        <AcceptTeamInvite token={token} signedInAs={signedInAs} invitedEmail={invite.email} />
      ) : (
        <PartnerInviteActions
          signUpHref={`/sign-up?redirect_url=${encodeURIComponent(back)}&email=${encodeURIComponent(invite.email)}`}
          signInHref={`/sign-in?redirect_url=${encodeURIComponent(back)}`}
          email={invite.email}
          likelyIos={/iPhone|iPad|iPod|Macintosh/.test((await headers()).get("user-agent") ?? "")}
        />
      )}
    </Shell>
  );
}
