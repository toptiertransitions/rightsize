import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { getTenantById, getLocalVendorById } from "@/lib/airtable";
import { verifyInviteToken, isVendorInvite } from "@/lib/invites";
import { AcceptInviteButton } from "./AcceptInviteButton";

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function InvitePage({ searchParams }: PageProps) {
  const { token } = await searchParams;

  if (!token) {
    return <InviteError message="No invite token provided." />;
  }

  let payload: ReturnType<typeof verifyInviteToken>;
  try {
    payload = verifyInviteToken(token);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid invite link.";
    return <InviteError message={message} />;
  }

  const { userId } = await auth();
  // Use a relative path so Clerk doesn't need the domain in its allowed-redirect-URL list
  const returnUrl = `/invite?token=${encodeURIComponent(token)}`;
  const isInviter = userId === payload.invitedBy;

  // ── Vendor invite ──────────────────────────────────────────────────────────
  if (isVendorInvite(payload)) {
    const vendor = await getLocalVendorById(payload.vendorId);
    if (!vendor) {
      return <InviteError message="This invite link is no longer valid." />;
    }

    return (
      <div className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-cream-200 w-full max-w-md p-8">
          <div className="w-14 h-14 bg-forest-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
            <svg className="w-7 h-7 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
            Vendor Portal Invitation
          </h1>
          <p className="text-gray-500 text-center mb-6">
            <span className="font-semibold text-gray-800">{vendor.vendorName}</span> has been invited to the{" "}
            <span className="font-semibold text-forest-700">TTT Vendor Portal</span>.
            View and manage items being routed to you.
          </p>
          {isInviter ? (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                You&apos;re signed in as the person who sent this invite. Sign out and have the vendor open this link.
              </div>
              <Link
                href={`/sign-out?redirect_url=${encodeURIComponent(returnUrl)}`}
                className="flex items-center justify-center w-full h-11 px-5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors"
              >
                Sign out
              </Link>
            </div>
          ) : userId ? (
            <AcceptInviteButton token={token} vendorId={payload.vendorId} />
          ) : (
            <div className="space-y-3">
              <Link
                href={`/sign-in?redirect_url=${encodeURIComponent(returnUrl)}`}
                className="flex items-center justify-center w-full h-11 px-5 bg-forest-600 text-white rounded-xl font-medium text-sm hover:bg-forest-700 transition-colors"
              >
                Sign in to access portal
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

  // ── Tenant invite ──────────────────────────────────────────────────────────
  const tenant = await getTenantById(payload.tenantId);
  if (!tenant) {
    return <InviteError message="This invite link is no longer valid." />;
  }

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
          <span className="font-semibold text-forest-700">{payload.role}</span>
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
          <AcceptInviteButton token={token} tenantId={payload.tenantId} />
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
          href="/home"
          className="inline-flex items-center justify-center h-11 px-5 bg-forest-600 text-white rounded-xl font-medium text-sm hover:bg-forest-700 transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
