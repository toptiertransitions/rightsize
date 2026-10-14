"use client";


import { useBackClose } from "@/lib/back-button";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Crown, MoreHorizontal, UserPlus, Mail, Bell, X, LogOut } from "lucide-react";
import type { PartnerUserView } from "@/lib/marketplace/types";
import { avatarColor, initials, inviteExpiresIn, relativeDay, sortTeam } from "@/components/partner-team/teamUi";
import { LeadRoutingEditor } from "@/components/partner-team/LeadRoutingEditor";
import { leadRecipientIds, type LeadRouting } from "@/lib/marketplace/leadRouting";
import { cn } from "@/lib/utils";
import {
  inviteTeammateAction,
  leaveTeamAction,
  makeOwnerAction,
  removeTeammateAction,
  resendTeamInviteAction,
  revokeTeamInviteAction,
  setLeadRoutingAction,
} from "./actions";

interface Props {
  companyName: string;
  meId: string;
  meClerkId?: string;
  isOwner: boolean;
  members: PartnerUserView[];
  leadRouting: LeadRouting;
  includeBusinessEmail: boolean;
  businessEmail?: string;
}

type Confirm = { title: string; body: string; cta: string; danger?: boolean; run: () => Promise<{ ok: boolean; error?: string }>; done: string };

export function TeamClient({ companyName, meId, meClerkId, isOwner, members, leadRouting, includeBusinessEmail, businessEmail }: Props) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, start] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const sorted = useMemo(() => sortTeam(members), [members]);
  const joined = members.filter((m) => m.status === "Active").length;
  const pending = members.length - joined;
  const me = members.find((m) => m.id === meId);
  const getsLeads = useMemo(() => new Set(leadRecipientIds(leadRouting, members).ids), [leadRouting, members]);

  function act(id: string, fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusyId(id);
    start(async () => {
      const r = await fn();
      setBusyId(null);
      setToast(r.ok ? { text: success } : { text: r.error ?? "That didn't work.", error: true });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Team</h1>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            Everyone who can sign in to {companyName}&rsquo;s partner account.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700 shadow-sm transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Invite teammate
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-white border border-cream-200 rounded-full px-3 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-forest-500" /> {joined} {joined === 1 ? "member" : "members"}
        </span>
        {pending > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-white border border-cream-200 rounded-full px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> {pending} pending {pending === 1 ? "invitation" : "invitations"}
          </span>
        )}
      </div>

      <ul className="bg-white rounded-2xl border border-cream-200 shadow-sm divide-y divide-cream-100">
        {sorted.map((m) => (
          <MemberRow
            key={m.id}
            m={m}
            isMe={m.id === meId}
            invitedByMe={!!meClerkId && m.invitedByClerkId === meClerkId}
            isOwner={isOwner}
            getsLeads={getsLeads.has(m.id)}
            busy={busyId === m.id}
            onResend={() => act(m.id, () => resendTeamInviteAction(m.id), `Invitation resent to ${m.email}.`)}
            onRevoke={() => setConfirm({ title: "Cancel invitation?", body: `${m.name || m.email} won't be able to use their invitation link.`, cta: "Cancel invitation", danger: true, run: () => revokeTeamInviteAction(m.id), done: "Invitation cancelled." })}
            onRemove={() => setConfirm({ title: `Remove ${m.name || m.email}?`, body: `They'll lose access to ${companyName}'s partner account right away. Top Tier can add them back later.`, cta: "Remove", danger: true, run: () => removeTeammateAction(m.id), done: `${m.name || m.email} was removed.` })}
            onMakeOwner={() => setConfirm({ title: `Make ${m.name || m.email} the account owner?`, body: "They'll be able to manage the team. You'll stay on the team as a member.", cta: "Make owner", run: () => makeOwnerAction(m.id), done: `${m.name || m.email} is now the account owner.` })}
          />
        ))}
      </ul>

      <div className="mt-6">
        <LeadRoutingEditor
          theme="light"
          members={members}
          routing={leadRouting}
          includeBusinessEmail={includeBusinessEmail}
          businessEmail={businessEmail}
          canEdit={isOwner}
          onSave={setLeadRoutingAction}
          onSaved={() => { setToast({ text: "Lead alerts updated." }); router.refresh(); }}
        />
      </div>

      <div className="mt-6 rounded-2xl bg-cream-100/60 border border-cream-200 px-5 py-4 text-sm text-gray-600 leading-relaxed">
        <p className="font-semibold text-gray-800 mb-1">How access works</p>
        <ul className="space-y-1 list-disc pl-4">
          <li>Everyone on the team sees your leads and can update your listing.</li>
          <li>The <strong>account owner</strong> can remove teammates and hand over ownership.</li>
          <li>Anyone on the team can invite a teammate. Invitations expire after 14 days.</li>
          <li>The account owner chooses who gets <strong>new lead alerts</strong>: everyone, or specific people.</li>
        </ul>
      </div>

      {me && me.role !== "Primary" && (
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => setConfirm({ title: `Leave ${companyName}?`, body: "You'll lose access to this partner account. Someone on the team can invite you back.", cta: "Leave team", danger: true, run: leaveTeamAction, done: "You left the team." })}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-red-600"
          >
            <LogOut className="w-4 h-4" /> Leave team
          </button>
        </div>
      )}

      {inviteOpen && (
        <InviteDialog
          companyName={companyName}
          onClose={() => setInviteOpen(false)}
          onSent={(email) => { setInviteOpen(false); setToast({ text: `Invitation sent to ${email}.` }); router.refresh(); }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          c={confirm}
          onClose={() => setConfirm(null)}
          onDone={(r) => {
            setConfirm(null);
            setToast(r.ok ? { text: confirm.done } : { text: r.error ?? "That didn't work.", error: true });
            if (r.ok) router.refresh();
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          className={cn(
            "fixed left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom,0px)+88px)] md:bottom-8 z-[60] text-sm px-4 py-2.5 rounded-xl shadow-lg max-w-[90vw]",
            toast.error ? "bg-red-600 text-white" : "bg-gray-900 text-white"
          )}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function MemberRow({ m, isMe, invitedByMe, isOwner, getsLeads, busy, onResend, onRevoke, onRemove, onMakeOwner }: {
  m: PartnerUserView;
  isMe: boolean;
  invitedByMe: boolean;
  isOwner: boolean;
  getsLeads: boolean;
  busy: boolean;
  onResend: () => void;
  onRevoke: () => void;
  onRemove: () => void;
  onMakeOwner: () => void;
}) {
  const pending = m.status === "Invited";
  const canManageInvite = pending && (isOwner || invitedByMe);
  const menu: { label: string; onClick: () => void; danger?: boolean }[] = [];
  if (canManageInvite) {
    menu.push({ label: m.inviteExpired ? "Send a new invitation" : "Resend invitation", onClick: onResend });
    menu.push({ label: "Cancel invitation", onClick: onRevoke, danger: true });
  } else if (!pending && isOwner && !isMe) {
    if (m.role !== "Primary") menu.push({ label: "Make account owner", onClick: onMakeOwner });
    menu.push({ label: "Remove from team", onClick: onRemove, danger: true });
  }

  return (
    <li className={cn("flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4", busy && "opacity-60")}>
      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0", pending ? "bg-gray-100 text-gray-400 border border-dashed border-gray-300" : avatarColor(m.email))}>
        {pending ? <Mail className="w-4 h-4" /> : initials(m.name, m.email)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-gray-900 text-sm truncate max-w-full">{m.name || m.email}</span>
          {isMe && <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">You</span>}
          {getsLeads && <Bell className="sm:hidden w-3.5 h-3.5 text-forest-600" aria-label="Gets leads" />}
          {m.role === "Primary" && !pending && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
              <Crown className="w-3 h-3" /> Owner
            </span>
          )}
          {pending && (
            <span className={cn("text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5", m.inviteExpired ? "text-red-700 bg-red-50" : "text-amber-700 bg-amber-50")}>
              {m.inviteExpired ? "Invite expired" : "Invited"}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate mt-0.5">
          {m.name ? m.email : null}
          {m.title ? <>{m.name ? " · " : ""}{m.title}</> : null}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {pending
            ? [`Invited ${relativeDay(m.lastInviteSentAt || m.invitedAt)}${m.invitedByName ? ` by ${m.invitedByName}` : ""}`, inviteExpiresIn(m)].filter(Boolean).join(" · ")
            : m.lastActiveAt ? `Active ${relativeDay(m.lastActiveAt)}` : m.acceptedAt ? `Joined ${relativeDay(m.acceptedAt)}` : ""}
        </p>
      </div>

      {getsLeads && (
        <span className="hidden sm:inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-medium bg-forest-50 text-forest-700 border border-forest-100" title="Gets new lead alerts">
          <Bell className="w-3 h-3" /> Gets leads
        </span>
      )}

      {menu.length > 0 ? (
        <RowMenu items={menu} disabled={busy} />
      ) : <div className="w-9" />}
    </li>
  );
}

function RowMenu({ items, disabled }: { items: { label: string; onClick: () => void; danger?: boolean; mobileOnly?: boolean }[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  if (items.length === 0) return <div className="w-9" />;
  const desktopEmpty = items.every((i) => i.mobileOnly);

  return (
    <>
    {desktopEmpty && <div className="hidden sm:block w-9" />}
    <div ref={ref} className={cn("relative", desktopEmpty && "sm:hidden")}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-label="More actions"
        aria-expanded={open}
        className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        <MoreHorizontal className="w-5 h-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-20 w-56 rounded-xl bg-white border border-gray-200 shadow-lg py-1.5">
          {items.map((i) => (
            <button
              key={i.label}
              type="button"
              onClick={() => { setOpen(false); i.onClick(); }}
              className={cn(
                "w-full text-left px-3.5 py-2.5 text-sm hover:bg-gray-50",
                i.danger ? "text-red-600" : "text-gray-700",
                i.mobileOnly && "sm:hidden"
              )}
            >
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
    </>
  );
}

function Modal({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label: string }) {
  useBackClose(onClose);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={label} className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-6 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] sm:pb-6">
        {children}
      </div>
    </div>
  );
}

function InviteDialog({ companyName, onClose, onSent }: { companyName: string; onClose: () => void; onSent: (email: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = await inviteTeammateAction({ name, email, title: title || undefined });
      if (r.ok) onSent(email.trim().toLowerCase());
      else setError(r.error);
    });
  }

  const input = "w-full h-11 px-3.5 rounded-xl border border-gray-200 text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-forest-500/30 focus:border-forest-500";
  return (
    <Modal onClose={onClose} label="Invite teammate">
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-lg font-bold text-gray-900">Invite a teammate</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 -mr-2 -mt-1 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-50"><X className="w-4 h-4" /></button>
      </div>
      <p className="text-sm text-gray-500 mb-5">They&rsquo;ll get an email to join {companyName}&rsquo;s partner account.</p>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">Name</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="off" required />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">Work email</span>
          <input className={input} type="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">Job title <span className="font-normal text-gray-400">(optional)</span></span>
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
        </label>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={pending} className="flex-1 h-11 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700 disabled:opacity-60">
            {pending ? "Sending…" : "Send invitation"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ConfirmDialog({ c, onClose, onDone }: { c: Confirm; onClose: () => void; onDone: (r: { ok: boolean; error?: string }) => void }) {
  const [pending, start] = useTransition();
  return (
    <Modal onClose={onClose} label={c.title}>
      <h2 className="text-lg font-bold text-gray-900 mb-2">{c.title}</h2>
      <p className="text-sm text-gray-500 leading-relaxed mb-6">{c.body}</p>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">Never mind</button>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => onDone(await c.run()))}
          className={cn("flex-1 h-11 rounded-xl text-white text-sm font-semibold disabled:opacity-60", c.danger ? "bg-red-600 hover:bg-red-700" : "bg-forest-600 hover:bg-forest-700")}
        >
          {pending ? "Working…" : c.cta}
        </button>
      </div>
    </Modal>
  );
}
