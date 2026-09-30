"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DeleteAccountAction } from "./DeleteAccountAction";
import { RenameProjectAction } from "./RenameProjectAction";

// ─── Invite Modal ──────────────────────────────────────────────────────────────
function InviteModal({ tenantId, title, onClose }: { tenantId: string; title: string; onClose: () => void }) {
  const [role, setRole] = useState<"Collaborator" | "Viewer">("Collaborator");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const hasEmail = email.trim().length > 0;

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, role, ...(hasEmail ? { email: email.trim() } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to send invite"); return; }
      if (data.sent) {
        setSent(true);
      } else {
        setInviteUrl(data.inviteUrl);
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  };

  const handleReset = () => {
    setInviteUrl("");
    setSent(false);
    setEmail("");
    setError("");
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-cream-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Success: email sent */}
          {sent ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-forest-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="font-semibold text-gray-900">Invite sent!</p>
              <p className="text-sm text-gray-400 mt-1">An email was sent to <span className="text-gray-600">{email.trim()}</span>.</p>
              <button onClick={handleReset} className="mt-4 text-sm text-forest-600 hover:underline">Send another</button>
            </div>
          ) : (
            <>
              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
                <div className="flex gap-2">
                  {(["Collaborator", "Viewer"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`flex-1 h-11 rounded-xl border text-sm font-medium transition-all ${
                        role === r ? "bg-forest-50 border-forest-400 text-forest-700" : "border-gray-300 text-gray-500 hover:border-gray-400"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  {role === "Collaborator" ? "Can add and edit rooms and items." : "Can view rooms and items only."}
                </p>
              </div>

              {/* Email */}
              {!inviteUrl && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    placeholder="invitee@example.com"
                    className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400"
                  />
                  <p className="text-xs text-gray-400 mt-1.5">
                    {hasEmail ? "We'll email the invite link directly." : "Leave blank to get a copy link instead."}
                  </p>
                </div>
              )}

              {/* Copy-link result */}
              {inviteUrl && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Invite Link</label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={inviteUrl}
                      className="flex-1 h-11 px-3 rounded-xl border border-gray-300 text-sm text-gray-600 bg-gray-50 truncate"
                    />
                    <button
                      onClick={handleCopy}
                      className="h-11 px-4 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">Link expires in 7 days.</p>
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}
            </>
          )}
        </div>

        <div className="px-6 py-4 flex gap-3 border-t border-cream-100">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            {sent ? "Done" : "Cancel"}
          </Button>
          {!sent && !inviteUrl && (
            <Button onClick={handleSubmit} loading={loading} className="flex-1">
              {hasEmail ? "Send Invite" : "Generate Link"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface ProjectActionsProps {
  tenantId: string;
  tenantName: string;
  tenantAddress?: string;
  tenantCity?: string;
  tenantState?: string;
  tenantZip?: string;
  // Non-TTT client owners get permanent, self-service account deletion instead
  // of the staff-reviewed "Request Deletion" flow.
  canDeleteAccount?: boolean;
  // Suppresses the inline Delete Account / Request Deletion button — used on
  // the single-project home view, where that action is instead rendered as
  // its own standalone section at the bottom of the page (deliberately
  // separated from Invite/Rename so it's not sitting next to routine
  // actions). Multi-project card views keep the inline button since there's
  // no single "bottom of the page" for an individual card.
  hideDangerZone?: boolean;
  // Suppresses the inline Rename button — used on the single-project home
  // view, where it's instead rendered standalone at the bottom of the page
  // (right below Delete Account), labeled "Name Project" there.
  hideRename?: boolean;
  // Overrides the Invite button/modal label — e.g. "Invite Family Member"
  // on the single-project NonTTTClient home view.
  inviteLabel?: string;
}

export function ProjectActions({ tenantId, tenantName, tenantAddress, tenantCity, tenantState, tenantZip, canDeleteAccount, hideDangerZone, hideRename, inviteLabel = "Invite Member" }: ProjectActionsProps) {
  const [showInvite, setShowInvite] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="secondary" onClick={() => setShowInvite(true)}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          {inviteLabel}
        </Button>
        {!hideRename && (
          <RenameProjectAction
            tenantId={tenantId}
            tenantName={tenantName}
            tenantAddress={tenantAddress}
            tenantCity={tenantCity}
            tenantState={tenantState}
            tenantZip={tenantZip}
          />
        )}
        {!hideDangerZone && (
          <DeleteAccountAction tenantId={tenantId} tenantName={tenantName} canDeleteAccount={canDeleteAccount} />
        )}
      </div>

      {showInvite && <InviteModal tenantId={tenantId} title={inviteLabel} onClose={() => setShowInvite(false)} />}
    </>
  );
}
