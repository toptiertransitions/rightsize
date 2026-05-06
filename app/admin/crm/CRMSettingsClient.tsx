"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

interface ConnectedAccount {
  email: string;
  name: string;
  expired: boolean;
  hasSendScope: boolean;
}

export function CRMSettingsClient({ gmailConnected, gmailEmail, calendarConnected, calendarEmail, connectedAccounts = [] }: { gmailConnected: boolean; gmailEmail?: string; calendarConnected: boolean; calendarEmail?: string; connectedAccounts?: ConnectedAccount[] }) {
  const searchParams = useSearchParams();
  const calendarStatus = searchParams.get("calendar");
  const calendarMsg = searchParams.get("msg");

  const [calendarToast, setCalendarToast] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (calendarStatus === "connected") {
      setCalendarToast({ ok: true, msg: "Google Calendar connected successfully." });
    } else if (calendarStatus === "error") {
      setCalendarToast({ ok: false, msg: calendarMsg ? decodeURIComponent(calendarMsg) : "Calendar connection failed." });
    }
  }, [calendarStatus, calendarMsg]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleSyncAll() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/crm/gmail/sync-all", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSyncResult({
          ok: true,
          msg: `Sync complete — ${data.imported} email${data.imported !== 1 ? "s" : ""} imported across ${data.contactsSearched} contact${data.contactsSearched !== 1 ? "s" : ""}.`,
        });
      } else {
        setSyncResult({ ok: false, msg: data.error || "Sync failed" });
      }
    } catch {
      setSyncResult({ ok: false, msg: "Network error — sync failed" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Gmail Sync card */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold text-white">Gmail Activity Sync</h2>
            <p className="text-sm text-gray-400 mt-1">
              Pulls the last 20 emails per CRM contact into the Activity Log for each opportunity.
              Run this manually whenever you want to refresh email history.
            </p>
          </div>
          {/* Status pill */}
          {gmailConnected ? (
            <span className="flex-shrink-0 inline-flex items-center gap-1.5 bg-green-900/40 border border-green-700 text-green-400 text-xs font-medium px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              Connected{gmailEmail ? ` · ${gmailEmail}` : ""}
            </span>
          ) : (
            <span className="flex-shrink-0 inline-flex items-center gap-1.5 bg-gray-800 border border-gray-700 text-gray-400 text-xs font-medium px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-500 inline-block" />
              Not connected
            </span>
          )}
        </div>

        {/* All connected accounts */}
        {connectedAccounts.length > 0 && (
          <div className="mb-4 rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800 text-gray-400 text-xs uppercase tracking-wide">
                  <th className="px-4 py-2 text-left font-medium">Staff Member</th>
                  <th className="px-4 py-2 text-left font-medium">Account</th>
                  <th className="px-4 py-2 text-left font-medium">Send Scope</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {connectedAccounts.map((acct) => (
                  <tr key={acct.email} className="bg-gray-900">
                    <td className="px-4 py-2.5 text-gray-200 font-medium">{acct.name}</td>
                    <td className="px-4 py-2.5 text-gray-400">{acct.email}</td>
                    <td className="px-4 py-2.5">
                      {acct.hasSendScope ? (
                        <span className="text-green-400 text-xs">Yes</span>
                      ) : (
                        <span className="text-gray-500 text-xs">Read only</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {acct.expired ? (
                        <span className="inline-flex items-center gap-1 text-amber-400 text-xs font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                          Token expired
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-green-400 text-xs font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                          Connected
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {connectedAccounts.length === 0 && (
          <p className="text-sm text-gray-500 mb-4">No Gmail accounts connected yet.</p>
        )}

        {gmailConnected ? (
          <div className="space-y-3">
            <button
              onClick={handleSyncAll}
              disabled={syncing}
              className="inline-flex items-center gap-2 bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-5 py-2.5 transition-colors"
            >
              <svg className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncing ? "Syncing…" : "Sync All Gmail Activity"}
            </button>

            {syncResult && (
              <p className={`text-sm ${syncResult.ok ? "text-green-400" : "text-red-400"}`}>
                {syncResult.msg}
              </p>
            )}

            <p className="text-xs text-gray-500">
              This may take a minute if you have many contacts. The page will stay open during the sync.
            </p>

            <a
              href="/api/crm/gmail/auth"
              className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2 transition-colors"
            >
              Reconnect Gmail account
            </a>
          </div>
        ) : (
          <div>
            <p className="text-sm text-amber-400 mb-3">
              Your Gmail account is not connected. Connect it from CRM settings to enable syncing.
            </p>
            <a
              href="/crm?tab=settings"
              className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              Go to CRM Settings →
            </a>
          </div>
        )}
      </div>
      {/* Google Calendar card */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold text-white">Google Calendar Integration</h2>
            <p className="text-sm text-gray-400 mt-1">
              Enables syncing daily focus shifts to Google Calendar and reading attendee RSVP status.
              Reconnect if the sync status dot shows a warning on the Plan page.
            </p>
          </div>
          {calendarConnected ? (
            <span className="flex-shrink-0 inline-flex items-center gap-1.5 bg-green-900/40 border border-green-700 text-green-400 text-xs font-medium px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              Connected{calendarEmail ? ` · ${calendarEmail}` : ""}
            </span>
          ) : (
            <span className="flex-shrink-0 inline-flex items-center gap-1.5 bg-gray-800 border border-gray-700 text-gray-400 text-xs font-medium px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-500 inline-block" />
              Not connected
            </span>
          )}
        </div>

        {calendarToast && (
          <p className={`text-sm mb-3 ${calendarToast.ok ? "text-green-400" : "text-red-400"}`}>
            {calendarToast.msg}
          </p>
        )}

        <a
          href="/api/admin/calendar-auth"
          className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {calendarConnected ? "Reconnect Google Calendar" : "Connect Google Calendar"}
        </a>

        {calendarConnected && (
          <p className="text-xs text-gray-500 mt-3">
            If you see ⚠ warning icons on calendar chips, click Reconnect to refresh the OAuth token.
          </p>
        )}
      </div>
    </div>
  );
}
