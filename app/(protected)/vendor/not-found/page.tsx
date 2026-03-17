import Link from "next/link";

export default function VendorNotFoundPage() {
  return (
    <div className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-cream-200 w-full max-w-md p-8 text-center">
        <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
          <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Vendor account not recognized</h1>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          Your account is not linked to a vendor profile. Please use the invite link sent to your email by Top Tier Transitions to set up portal access.
        </p>
        <p className="text-gray-400 text-xs mb-6">
          If you believe this is an error, contact your TTT representative and ask them to re-send your login link.
        </p>
        <Link
          href="/sign-out?redirect_url=%2F"
          className="inline-flex items-center justify-center h-10 px-5 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200 transition-colors"
        >
          Sign out
        </Link>
      </div>
    </div>
  );
}
