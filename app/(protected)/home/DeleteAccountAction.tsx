"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";

interface DeleteAccountActionProps {
  tenantId: string;
  tenantName: string;
  // Non-TTT client owners get permanent, self-service account deletion instead
  // of the staff-reviewed "Request Deletion" flow.
  canDeleteAccount?: boolean;
  // Render just the trigger as a link-style button (used inline in a compact
  // card) vs. a full-width, more deliberate button (used standalone at the
  // bottom of a page, away from other actions).
  variant?: "inline" | "standalone";
}

export function DeleteAccountAction({ tenantId, tenantName, canDeleteAccount, variant = "inline" }: DeleteAccountActionProps) {
  const { signOut } = useClerk();
  const [showDeleteRequest, setShowDeleteRequest] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteRequestSent, setDeleteRequestSent] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDeleteRequest() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tenants/delete-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, reason: deleteReason.trim() || undefined }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to send request");
      }
      setDeleteRequestSent(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteAccountLoading(true);
    setDeleteAccountError("");
    try {
      const res = await fetch("/api/tenants/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to delete account");
      }
      await signOut({ redirectUrl: "/" });
    } catch (e: unknown) {
      setDeleteAccountError(e instanceof Error ? e.message : "Something went wrong");
      setDeleteAccountLoading(false);
    }
  }

  const label = canDeleteAccount ? "Delete Account" : "Request Deletion";
  const onTrigger = () => {
    if (canDeleteAccount) {
      setDeleteAccountError("");
      setShowDeleteAccount(true);
    } else {
      setDeleteReason("");
      setDeleteRequestSent(false);
      setError("");
      setShowDeleteRequest(true);
    }
  };

  return (
    <>
      {variant === "standalone" ? (
        <div className="mt-12 pt-6 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Danger Zone</p>
          <button
            onClick={onTrigger}
            className="text-sm text-red-500 hover:text-red-700 font-medium px-3 py-1.5 -mx-3 rounded-lg hover:bg-red-50 transition-colors"
          >
            {label}
          </button>
        </div>
      ) : (
        <button
          onClick={onTrigger}
          className="text-sm text-red-500 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
        >
          {label}
        </button>
      )}

      {/* Deletion request modal */}
      {showDeleteRequest && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            {deleteRequestSent ? (
              <div className="text-center py-2">
                <div className="w-12 h-12 bg-forest-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Request sent</h3>
                <p className="text-sm text-gray-500 mb-5">
                  The Top Tier team has been notified and will follow up with you shortly.
                </p>
                <button
                  onClick={() => setShowDeleteRequest(false)}
                  className="w-full px-4 py-2.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold text-gray-900 mb-1">Request Project Deletion</h3>
                <p className="text-sm text-gray-500 mb-4">
                  We&apos;ll notify the Top Tier team to review your request for{" "}
                  <span className="font-semibold text-gray-700">{tenantName}</span>.
                  They&apos;ll be in touch to confirm before anything is removed.
                </p>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Reason <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={deleteReason}
                    onChange={e => setDeleteReason(e.target.value)}
                    rows={3}
                    placeholder="Let us know why you'd like to delete this project…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 resize-none"
                  />
                </div>
                {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDeleteRequest(false)}
                    className="flex-1 px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteRequest}
                    disabled={loading}
                    className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? "Sending…" : "Send Request"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Permanent account deletion modal (non-TTT client owners) */}
      {showDeleteAccount && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Delete Your Account</h3>
            <p className="text-sm text-gray-500 mb-3">
              Your project, <span className="font-semibold text-gray-700">{tenantName}</span>, will be archived for a brief period of time in case you change your mind.
              Your Rightsize account itself will be permanently deleted and you&apos;ll be signed out.
            </p>
            <p className="text-sm text-red-600 font-medium mb-4">This cannot be undone.</p>
            {deleteAccountError && <p className="text-sm text-red-500 mb-3">{deleteAccountError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteAccount(false)}
                className="flex-1 px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                disabled={deleteAccountLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteAccountLoading}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {deleteAccountLoading ? "Deleting…" : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
