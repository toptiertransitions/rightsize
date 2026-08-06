import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isTTTAdmin } from "@/lib/config";
import { AdminHeader } from "@/app/admin/components/AdminHeader";
import { CreateLocationButton } from "./CreateLocationButton";

interface Props {
  searchParams: Promise<{ refresh_token?: string; error?: string }>;
}

export default async function EbaySetupPage({ searchParams }: Props) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isTTTAdmin(userId)) redirect("/home");

  const params = await searchParams;
  const refreshToken = params.refresh_token;
  const error        = params.error;

  const clientId     = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const ruName       = process.env.EBAY_RUNAME;
  const storedToken  = process.env.EBAY_REFRESH_TOKEN;

  const credentialsSet = !!(clientId && clientSecret && ruName);
  const fullyConfigured = credentialsSet && !!storedToken;

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="ebay" />
      <main className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-white mb-2">eBay Integration Setup</h1>
        <p className="text-gray-400 text-sm mb-8">
          One-time OAuth authorization to enable publishing to eBay.
        </p>

        {/* Status */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Configuration Status</h2>
          <div className="space-y-3">
            {[
              { label: "EBAY_CLIENT_ID",     ok: !!clientId },
              { label: "EBAY_CLIENT_SECRET", ok: !!clientSecret },
              { label: "EBAY_RUNAME",        ok: !!ruName },
              { label: "EBAY_REFRESH_TOKEN", ok: !!storedToken },
            ].map(({ label, ok }) => (
              <div key={label} className="flex items-center justify-between">
                <code className="text-sm text-gray-300">{label}</code>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                  ok
                    ? "bg-green-900/40 text-green-400 border-green-700"
                    : "bg-red-900/40 text-red-400 border-red-700"
                }`}>
                  {ok ? "Set" : "Missing"}
                </span>
              </div>
            ))}
          </div>

          {fullyConfigured && (
            <div className="mt-4 pt-4 border-t border-gray-800">
              <p className="text-green-400 text-sm font-semibold">eBay integration is fully configured and active.</p>
            </div>
          )}
        </div>

        {/* Step 1: Developer credentials */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Step 1 — Developer App Credentials</h2>
          <p className="text-gray-300 text-sm mb-3">
            Add these to <code className="text-forest-400">.env.local</code> (and Vercel environment variables):
          </p>
          <pre className="bg-gray-800 rounded-xl p-4 text-xs text-gray-300 overflow-x-auto">
{`EBAY_CLIENT_ID=          # App ID from developer.ebay.com
EBAY_CLIENT_SECRET=      # Cert ID from developer.ebay.com
EBAY_DEV_ID=             # Dev ID from developer.ebay.com
EBAY_RUNAME=             # RuName pointing to /api/ebay/oauth/callback
EBAY_FULFILLMENT_POLICY_ID=294070239015
EBAY_PAYMENT_POLICY_ID=294070200015
EBAY_RETURN_POLICY_ID=294070211015
EBAY_MERCHANT_LOCATION_KEY=TTT_CHICAGO`}
          </pre>
        </div>

        {/* Step 2: OAuth */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Step 2 — Authorize with eBay</h2>
          {credentialsSet ? (
            <>
              <p className="text-gray-300 text-sm mb-4">
                Click below to authorize this app with your eBay seller account.
                You&apos;ll be redirected to eBay and back — this only needs to happen once.
              </p>
              <a
                href="/api/ebay/oauth/authorize"
                className="inline-block px-5 py-2.5 bg-[#e43137] hover:bg-[#c9292e] text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Connect eBay Account
              </a>
            </>
          ) : (
            <p className="text-amber-400 text-sm">
              Complete Step 1 first — credentials must be set before initiating OAuth.
            </p>
          )}
        </div>

        {/* OAuth error */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-2xl p-5 mb-6">
            <p className="text-red-300 text-sm font-semibold mb-1">OAuth error</p>
            <p className="text-red-400 text-xs font-mono break-all">{decodeURIComponent(error)}</p>
          </div>
        )}

        {/* Step 3: Refresh token */}
        {refreshToken && (
          <div className="bg-green-900/20 border border-green-700 rounded-2xl p-6 mb-6">
            <h2 className="text-sm font-semibold text-green-400 uppercase tracking-wide mb-2">Step 3 — Save Your Refresh Token</h2>
            <p className="text-gray-300 text-sm mb-3">
              Authorization succeeded. Copy this token and add it as{" "}
              <code className="text-forest-400">EBAY_REFRESH_TOKEN</code> in{" "}
              <code className="text-forest-400">.env.local</code> and in Vercel environment variables.
              It is valid for 18 months.
            </p>
            <pre className="bg-gray-800 rounded-xl p-4 text-xs text-gray-200 break-all whitespace-pre-wrap select-all">
              {refreshToken}
            </pre>
            <p className="text-gray-500 text-xs mt-3">
              After adding to Vercel, redeploy. Then return to this page to confirm all four fields show &quot;Set&quot;.
            </p>
          </div>
        )}

        {/* Step 4: Merchant location (one-time) */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Step 4 — Merchant Location</h2>
          <p className="text-gray-300 text-sm mb-4">
            eBay requires a warehouse location before offers can be published. Click below to create it — only needs to be done once.
          </p>
          {fullyConfigured
            ? <CreateLocationButton />
            : <p className="text-amber-400 text-sm">Complete Steps 1–3 first.</p>
          }
        </div>
      </main>
    </div>
  );
}
