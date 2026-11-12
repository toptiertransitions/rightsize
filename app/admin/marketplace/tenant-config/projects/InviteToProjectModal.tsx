"use client";

import { useEffect, useState } from "react";

type Who = "client" | "Collaborator" | "Viewer";

const OPTIONS: { id: Who; label: string; hint: string }[] = [
  { id: "client", label: "Client", hint: "Owns the project" },
  { id: "Collaborator", label: "Family member", hint: "Can view and add" },
  { id: "Viewer", label: "Viewer", hint: "View only" },
];

// Tenant Config > Projects: sends the same invite as the project's own
// Invite buttons (POST /api/invites), so a branded project gets the
// community's co-branded email.
export function InviteToProjectModal({ projectId, projectName, brandName, onClose }: {
  projectId: string;
  projectName: string;
  /** Active brand on the project, if any */
  brandName?: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [who, setWho] = useState<Who>("Collaborator");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !sending) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          who === "client"
            ? { tenantId: projectId, role: "Owner", type: "client", email: email.trim() }
            : { tenantId: projectId, role: who, email: email.trim() }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't send the invite");
      setSentTo(email.trim());
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the invite");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => { if (!sending) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="invite-title">
        <h2 id="invite-title" className="text-lg font-bold text-white">Invite to {projectName}</h2>
        <p className="mt-1 text-sm text-gray-400">
          {brandName ? `They'll get the ${brandName} co-branded invite email.` : "They'll get the standard Top Tier invite email."}
        </p>

        {sentTo ? (
          <div className="mt-5">
            <p className="text-sm text-green-400">Invite sent to {sentTo}.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setSentTo("")} className="h-9 px-4 rounded-lg border border-gray-700 text-sm text-gray-300 hover:bg-gray-800">Invite another</button>
              <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg bg-forest-600 text-sm font-medium text-white hover:bg-forest-700">Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={send} className="mt-5 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={who === o.id}
                  onClick={() => setWho(o.id)}
                  className={`rounded-xl border px-3 py-2 text-left transition-colors ${who === o.id ? "border-forest-500 bg-forest-500/10" : "border-gray-700 hover:border-gray-600"}`}
                >
                  <span className="block text-sm font-semibold text-white">{o.label}</span>
                  <span className="block text-[11px] text-gray-400">{o.hint}</span>
                </button>
              ))}
            </div>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full h-10 px-3 rounded-xl border border-gray-700 bg-gray-800 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-forest-500"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} disabled={sending} className="h-9 px-4 rounded-lg border border-gray-700 text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={sending || !email.trim()} className="h-9 px-4 rounded-lg bg-forest-600 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50">
                {sending ? "Sending…" : "Send invite"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
