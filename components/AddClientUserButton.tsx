"use client";

import { useState } from "react";

interface Props {
  tenantId: string;
  projectName: string;
}

export function AddClientUserButton({ tenantId, projectName }: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; error?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, role: "Owner", email: email.trim(), type: "client" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error ?? "Failed to send invite" });
      } else {
        setResult({ success: true });
        setEmail("");
      }
    } catch {
      setResult({ error: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setEmail("");
    setResult(null);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-forest-600 text-white text-sm font-medium rounded-lg hover:bg-forest-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
        Add Client User
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={handleClose}>
          <div
            className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Add Client User</h2>
                <p className="text-sm text-gray-500 mt-0.5">{projectName}</p>
              </div>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {result?.success ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-forest-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-gray-900 font-semibold mb-1">Invite sent!</p>
                <p className="text-sm text-gray-500 mb-4">They&apos;ll receive an email to access their project.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setResult(null)}
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Invite another
                  </button>
                  <button
                    onClick={handleClose}
                    className="flex-1 px-4 py-2 bg-forest-600 text-white rounded-lg text-sm font-medium hover:bg-forest-700 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="client@example.com"
                    required
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
                  />
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  They&apos;ll receive a welcome email with a link to access their project as an Owner.
                </p>
                {result?.error && (
                  <p className="text-sm text-red-600">{result.error}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !email.trim()}
                    className="flex-1 px-4 py-2 bg-forest-600 text-white rounded-lg text-sm font-medium hover:bg-forest-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "Sending…" : "Send Invite"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
