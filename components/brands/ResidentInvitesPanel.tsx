"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ResidentInviteInput, ResidentInviteResult, ResidentInviteRow } from "@/lib/brands/residentInviteShared";

// "Invite a resident": emails someone with no account yet a co-branded invite
// to the community's app. Used on Tenant Config (dark) and the community's
// partner portal (light).

const THEMES = {
  dark: {
    card: "rounded-2xl border border-gray-800 bg-gray-900 p-6",
    title: "text-lg font-bold text-white",
    sub: "text-sm text-gray-400",
    label: "text-xs text-gray-400",
    input: "mt-1 w-full h-10 px-3 rounded-xl border border-gray-700 bg-gray-800 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-forest-500",
    row: "border-t border-gray-800",
    name: "text-sm font-medium text-white",
    meta: "text-xs text-gray-500",
    link: "text-xs text-forest-400 hover:text-forest-300 disabled:opacity-50",
    muted: "text-xs text-gray-500 hover:text-gray-300 disabled:opacity-50",
    ok: "text-sm text-green-400",
    err: "text-sm text-red-400",
    btn: "h-10 px-5 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700 disabled:opacity-50",
    badge: { Invited: "bg-amber-500/15 text-amber-300", Joined: "bg-green-500/15 text-green-300", Canceled: "bg-gray-700 text-gray-400" },
  },
  light: {
    card: "rounded-2xl border border-gray-200 bg-white p-6 shadow-sm",
    title: "text-lg font-semibold text-[#2d4a3e]",
    sub: "text-sm text-gray-500",
    label: "text-xs text-gray-500",
    input: "mt-1 w-full h-10 px-3 rounded-xl border border-gray-300 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2d4a3e]/20 focus:border-[#2d4a3e]",
    row: "border-t border-gray-100",
    name: "text-sm font-medium text-gray-900",
    meta: "text-xs text-gray-500",
    link: "text-xs font-medium text-[#2d4a3e] hover:underline disabled:opacity-50",
    muted: "text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50",
    ok: "text-sm text-green-700",
    err: "text-sm text-red-600",
    btn: "h-10 px-5 rounded-xl bg-[#2d4a3e] text-white text-sm font-semibold hover:bg-[#24403a] disabled:opacity-50",
    badge: { Invited: "bg-amber-100 text-amber-800", Joined: "bg-green-100 text-green-800", Canceled: "bg-gray-100 text-gray-500" },
  },
} as const;

function fmt(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ResidentInvitesPanel({ communityName, invites, theme, onInvite, onResend, onCancel }: {
  communityName: string;
  invites: ResidentInviteRow[];
  theme: "dark" | "light";
  onInvite: (input: ResidentInviteInput) => Promise<ResidentInviteResult>;
  onResend: (inviteId: string) => Promise<ResidentInviteResult>;
  onCancel: (inviteId: string) => Promise<ResidentInviteResult>;
}) {
  const t = THEMES[theme];
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [moveDate, setMoveDate] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setMessage(null);
    const res = await onInvite({ name, email, moveDate });
    setSending(false);
    if (!res.ok) { setMessage({ ok: false, text: res.error }); return; }
    setMessage({ ok: true, text: `Invite sent to ${name.trim()}.` });
    setName(""); setEmail(""); setMoveDate("");
    router.refresh();
  }

  async function rowAction(id: string, fn: (id: string) => Promise<ResidentInviteResult>, okText: string) {
    setRowBusy(id);
    setMessage(null);
    const res = await fn(id);
    setRowBusy(null);
    setMessage(res.ok ? { ok: true, text: okText } : { ok: false, text: res.error });
    if (res.ok) router.refresh();
  }

  return (
    <div className={t.card}>
      <h2 className={t.title}>Invite a resident</h2>
      <p className={`${t.sub} mt-1`}>
        Emails a {communityName} invitation to someone who doesn&rsquo;t have an account yet. When they sign up, their move plan is created with your branding, checklist and team.
      </p>

      <form onSubmit={invite} className="mt-5 grid grid-cols-1 sm:grid-cols-[1fr_1fr_150px_auto] gap-3 sm:items-end">
        <label>
          <span className={t.label}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Eleanor Whitfield" className={t.input} />
        </label>
        <label>
          <span className={t.label}>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@example.com" className={t.input} />
        </label>
        <label>
          <span className={t.label}>Move date (optional)</span>
          <input type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} className={t.input} />
        </label>
        <button type="submit" disabled={sending || !name.trim() || !email.trim()} className={t.btn}>
          {sending ? "Sending…" : "Send invite"}
        </button>
      </form>
      {message && <p className={`mt-3 ${message.ok ? t.ok : t.err}`}>{message.text}</p>}

      {invites.length > 0 && (
        <ul className="mt-6">
          {invites.map((i) => (
            <li key={i.id} className={`${t.row} py-3 flex flex-wrap items-center gap-x-4 gap-y-1`}>
              <div className="min-w-0 flex-1">
                <p className={t.name}>
                  {i.name} <span className={`ml-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.badge[i.status]}`}>{i.status}</span>
                </p>
                <p className={`${t.meta} truncate`}>
                  {i.email}
                  {i.moveDate ? ` · Moving ${fmt(i.moveDate)}` : ""}
                  {` · Invited by ${i.invitedByName}${i.invitedBySide === "Top Tier" ? " (Top Tier)" : ""}`}
                  {i.status === "Joined" && i.joinedAt ? ` · Joined ${fmt(i.joinedAt)}` : i.lastSentAt ? ` · Sent ${fmt(i.lastSentAt)}${i.sendCount > 1 ? ` (${i.sendCount}×)` : ""}` : ""}
                </p>
              </div>
              {i.status === "Invited" && (
                <div className="flex items-center gap-3">
                  <button type="button" disabled={rowBusy !== null} onClick={() => rowAction(i.id, onResend, `Invite resent to ${i.name}.`)} className={t.link}>
                    {rowBusy === i.id ? "Working…" : "Resend"}
                  </button>
                  <button type="button" disabled={rowBusy !== null} onClick={() => rowAction(i.id, onCancel, `Invite to ${i.name} canceled.`)} className={t.muted}>
                    Cancel
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
