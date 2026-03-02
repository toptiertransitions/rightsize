import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTenantById } from "@/lib/airtable";
import { verifyInviteToken } from "@/lib/invites";
import { AcceptInviteButton } from "./AcceptInviteButton";

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function InvitePage({ searchParams }: PageProps) {
  const { token } = await searchParams;

  if (!token) {
    return <InviteError message="No invite token provided." />;
  }

  // Verify token server-side
  let tenantId: string;
  let role: string;
  let invitedBy: string;
  try {
    const data = verifyInviteToken(token);
    tenantId = data.tenantId;
    role = data.role;
    invitedBy = data.invitedBy;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid invite link.";
    return <InviteError message={message} />;
  }

  const tenant = await getTenantById(tenantId);
  if (!tenant) {
    return <InviteError message="This invite link is no longer valid." />;
  }

  const { userId } = await auth();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const returnUrl = `${appUrl}/invite?token=${token}`;

  // Warn if the person who sent the invite is currently signed in
  const isInviter = userId === invitedBy;

  return (
    <div className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-cream-200 w-full max-w-md p-8">
        <div className="w-14 h-14 bg-forest-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
          <svg className="w-7 h-7 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
          You&apos;ve been invited
        </h1>
        <p className="text-gray-500 text-center mb-6">
          Join <span className="font-semibold text-gray-800">{tenant.name}</span> as a{" "}
          <span className="font-semibold text-forest-700">{role}</span>
        </p>

        {isInviter ? (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              You&apos;re signed in as the person who sent this invite. Sign out and have the recipient open this link in their own browser.
            </div>
            <Link
              href={`/sign-out?redirect_url=${encodeURIComponent(returnUrl)}`}
              className="flex items-center justify-center w-full h-11 px-5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors"
            >
              Sign out
            </Link>
          </div>
        ) : userId ? (
          <AcceptInviteButton token={token} tenantId={tenantId} />
        ) : (
          <div className="space-y-3">
            <Link
              href={`/sign-in?redirect_url=${encodeURIComponent(returnUrl)}`}
              className="flex items-center justify-center w-full h-11 px-5 bg-forest-600 text-white rounded-xl font-medium text-sm hover:bg-forest-700 transition-colors"
            >
              Sign in to accept
            </Link>
            <Link
              href={`/sign-up?redirect_url=${encodeURIComponent(returnUrl)}`}
              className="flex items-center justify-center w-full h-11 px-5 bg-cream-100 text-forest-700 rounded-xl font-medium text-sm border border-cream-300 hover:bg-cream-200 transition-colors"
            >
              Create an account
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function InviteError({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-cream-200 w-full max-w-md p-8 text-center">
        <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
          <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid Invite</h1>
        <p className="text-gray-500 text-sm mb-6">{message}</p>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center h-11 px-5 bg-forest-600 text-white rounded-xl font-medium text-sm hover:bg-forest-700 transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
