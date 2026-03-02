"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

// ─── Invite Modal ──────────────────────────────────────────────────────────────
function InviteModal({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
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
          <h2 className="text-lg font-bold text-gray-900">Invite Member</h2>
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
}

export function ProjectActions({ tenantId, tenantName, tenantAddress, tenantCity, tenantState, tenantZip }: ProjectActionsProps) {
  const router = useRouter();
  const [showInvite, setShowInvite] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [newName, setNewName] = useState(tenantName);
  const [address, setAddress] = useState(tenantAddress ?? "");
  const [city, setCity] = useState(tenantCity ?? "");
  const [state, setState] = useState(tenantState ?? "");
  const [zip, setZip] = useState(tenantZip ?? "");
  const [confirmName, setConfirmName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleRename() {
    if (!newName.trim()) {
      setShowRename(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          name: newName.trim(),
          address: address.trim(),
          city: city.trim(),
          state: state.trim().toUpperCase(),
          zip: zip.trim(),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to rename");
      }
      setShowRename(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (confirmName !== tenantName) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/tenants?tenantId=${encodeURIComponent(tenantId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to delete");
      }
      router.push("/home");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="secondary" onClick={() => setShowInvite(true)}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Invite Member
        </Button>
        <button
          onClick={() => { setNewName(tenantName); setAddress(tenantAddress ?? ""); setCity(tenantCity ?? ""); setState(tenantState ?? ""); setZip(tenantZip ?? ""); setError(""); setShowRename(true); }}
          className="text-sm text-gray-500 hover:text-gray-700 font-medium px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          Rename
        </button>
        <button
          onClick={() => { setConfirmName(""); setError(""); setShowDelete(true); }}
          className="text-sm text-red-500 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
        >
          Delete Project
        </button>
      </div>

      {showInvite && <InviteModal tenantId={tenantId} onClose={() => setShowInvite(false)} />}

      {/* Rename modal */}
      {showRename && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Rename Project</h3>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleRename()}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 mb-4"
              autoFocus
            />
            <p className="text-xs text-gray-500 font-medium mb-2">Project Address <span className="font-normal">(optional — used to filter local vendors)</span></p>
            <div className="space-y-2">
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Street address"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  placeholder="City"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                />
                <input
                  type="text"
                  value={state}
                  onChange={e => setState(e.target.value)}
                  placeholder="ST"
                  maxLength={2}
                  className="w-16 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 uppercase"
                />
                <input
                  type="text"
                  value={zip}
                  onChange={e => setZip(e.target.value)}
                  placeholder="Zip"
                  className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                />
              </div>
            </div>
            {error && <p className="text-sm text-red-500 mt-3 mb-1">{error}</p>}
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={() => setShowRename(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                disabled={loading}
              >
                Cancel
              </button>
              <Button onClick={handleRename} disabled={loading || !newName.trim()}>
                {loading ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Project</h3>
            <p className="text-sm text-gray-500 mb-4">
              This will permanently delete <span className="font-semibold text-gray-700">{tenantName}</span> and all its rooms, items, and members. This cannot be undone.
            </p>
            <p className="text-sm text-gray-600 mb-2">
              Type <span className="font-mono font-semibold">{tenantName}</span> to confirm:
            </p>
            <input
              type="text"
              value={confirmName}
              onChange={e => setConfirmName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-3"
              autoFocus
            />
            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDelete(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={loading || confirmName !== tenantName}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Deleting…" : "Delete Forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
