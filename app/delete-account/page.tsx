import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { canSelfDelete } from "@/lib/account-deletion";
import { DeleteAccountConfirm } from "./DeleteAccountConfirm";

// Public page for deleting a Rightsize account: the in-app "Delete account"
// menu item opens it, and it's the web link listed with the app stores for
// people who don't have the app. Signed in: delete right here. Signed out:
// sign in first, or ask by email.
export const metadata: Metadata = { title: "Delete your Rightsize account", robots: "noindex" };
export const dynamic = "force-dynamic";

export default async function DeleteAccountPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const { userId } = await auth();
  const user = userId ? await currentUser().catch(() => null) : null;
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? "";
  const staff = userId ? !(await canSelfDelete(userId)) : false;

  return (
    <div className="min-h-[100dvh] bg-cream-50 flex items-center justify-center px-4 py-10">
      <div className="bg-white rounded-2xl shadow-lg border border-cream-200 w-full max-w-lg p-7 sm:p-8">
        <Image src="/ttt-icon.png" alt="Top Tier Transitions" width={48} height={48} className="w-12 h-12 mb-5" />

        {deleted ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Your account has been deleted</h1>
            <p className="text-gray-600 leading-relaxed">Your sign-in and your access to Rightsize have been removed. Thank you for using Rightsize.</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Delete your Rightsize account</h1>
            <p className="text-gray-600 leading-relaxed mb-5">
              This permanently deletes your own Rightsize by Top Tier Transitions account. Projects and partner companies you belong to are not deleted.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 mb-6 text-sm">
              <div className="rounded-xl bg-red-50 border border-red-100 p-4">
                <p className="font-semibold text-red-900 mb-1.5">Deleted</p>
                <ul className="list-disc pl-4 space-y-1 text-red-900/80">
                  <li>Your sign-in and profile</li>
                  <li>Your access to every project and partner account</li>
                  <li>Your notification settings and device tokens</li>
                </ul>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
                <p className="font-semibold text-gray-900 mb-1.5">Kept</p>
                <ul className="list-disc pl-4 space-y-1 text-gray-600">
                  <li>Your projects and your company&rsquo;s partner account, for the rest of your family or team</li>
                  <li>Completed sales, invoices and payout records, as required for tax and accounting</li>
                </ul>
              </div>
            </div>

            {!userId ? (
              <div className="space-y-4">
                <Link
                  href={`/sign-in?redirect_url=${encodeURIComponent("/delete-account")}`}
                  className="flex items-center justify-center w-full h-12 rounded-xl bg-forest-600 text-white font-semibold hover:bg-forest-700"
                >
                  Sign in to delete your account
                </Link>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Can&rsquo;t sign in? Email <a href="mailto:info@toptiertransitions.com?subject=Delete%20my%20Rightsize%20account" className="text-forest-700 font-medium hover:underline">info@toptiertransitions.com</a> from
                  the address on your account with the subject &ldquo;Delete my Rightsize account&rdquo;. We&rsquo;ll confirm and delete it within 30 days.
                </p>
              </div>
            ) : staff ? (
              <p className="text-sm text-gray-600 leading-relaxed rounded-xl bg-amber-50 border border-amber-100 p-4">
                Top Tier staff accounts are managed by your Top Tier administrator. Ask them to remove your account, or email{" "}
                <a href="mailto:info@toptiertransitions.com" className="text-forest-700 font-medium hover:underline">info@toptiertransitions.com</a>.
              </p>
            ) : (
              <DeleteAccountConfirm email={email} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
