"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crown, MoreHorizontal, Search, UserPlus, X, Bell, BellOff, Mail, AlertTriangle, ChevronDown } from "lucide-react";
import type { PartnerUserView, PartnerUserStatus } from "@/lib/marketplace/types";
import { initials, inviteExpiresIn, relativeDay } from "@/components/partner-team/teamUi";
import { LeadRoutingEditor } from "@/components/partner-team/LeadRoutingEditor";
import { leadRecipientIds, type LeadRouting } from "@/lib/marketplace/leadRouting";
import { cn } from "@/lib/utils";
import {
  adminCopyInviteLinkAction,
  adminInviteUserAction,
  adminMakePrimaryAction,
  adminRemoveUserAction,
  adminResendInviteAction,
  adminRestoreUserAction,
  adminRevokeInviteAction,
  adminSetLeadRoutingAction,
} from "./actions";

interface Company { id: string; name: string; lifecycle: string; pocName: string; email: string; leadRouting: LeadRouting; leadSkipBusinessEmail: boolean }

interface Props {
  users: PartnerUserView[];
  companies: Company[];
  partnerName: Record<string, string>;
  canManage: boolean;
  initialPartnerId: string;
}

type StatusTab = "all" | "Active" | "Invited" | "Removed";
type ActionResult = { ok: boolean; error?: string; data?: unknown };
type Confirm = { title: string; body: string; cta: string; danger?: boolean; run: () => Promise<ActionResult>; done: string };

const DARK_AVATARS = ["bg-emerald-900/60 text-emerald-200", "bg-sky-900/60 text-sky-200", "bg-amber-900/60 text-amber-200", "bg-rose-900/60 text-rose-200", "bg-violet-900/60 text-violet-200", "bg-teal-900/60 text-teal-200"];
function darkAvatar(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return DARK_AVATARS[h % DARK_AVATARS.length];
}

export function UsersClient({ users, companies, partnerName, canManage, initialPartnerId }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<StatusTab>("all");
  const [partnerId, setPartnerId] = useState(initialPartnerId);
  const [invite, setInvite] = useState<{ partnerId: string; role: "Primary" | "Member" } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showNoOwner, setShowNoOwner] = useState(false);
  const [routingFor, setRoutingFor] = useState<string | null>(null);
  const [, start] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  // "Removed" tab also covers cancelled invitations
  const statusOf = (u: PartnerUserView): Exclude<StatusTab, "all"> => (u.status === "Revoked" ? "Removed" : (u.status as Exclude<PartnerUserStatus, "Revoked">));

  const counts = useMemo(() => {
    const scoped = partnerId ? users.filter((u) => u.partnerId === partnerId) : users;
    return {
      all: scoped.filter((u) => u.status !== "Removed" && u.status !== "Revoked").length,
      Active: scoped.filter((u) => u.status === "Active").length,
      Invited: scoped.filter((u) => u.status === "Invited").length,
      Removed: scoped.filter((u) => u.status === "Removed" || u.status === "Revoked").length,
    };
  }, [users, partnerId]);

  const ownerless = useMemo(() => {
    const owned = new Set(users.filter((u) => u.role === "Primary" && (u.status === "Active" || u.status === "Invited")).map((u) => u.partnerId));
    return companies.filter((c) => !owned.has(c.id) && c.lifecycle !== "Prospect");
  }, [users, companies]);

  const getsLeads = useMemo(() => {
    const byCompany = new Map<string, PartnerUserView[]>();
    for (const u of users) byCompany.set(u.partnerId, [...(byCompany.get(u.partnerId) ?? []), u]);
    const ids = new Set<string>();
    for (const c of companies) for (const id of leadRecipientIds(c.leadRouting, byCompany.get(c.id) ?? []).ids) ids.add(id);
    return ids;
  }, [users, companies]);

  const companiesWithTeams = useMemo(() => new Set(users.filter((u) => u.status === "Active").map((u) => u.partnerId)).size, [users]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => (tab === "all" ? u.status !== "Removed" && u.status !== "Revoked" : statusOf(u) === tab))
      .filter((u) => !partnerId || u.partnerId === partnerId)
      .filter((u) => !q || [u.name, u.email, u.title ?? "", partnerName[u.partnerId] ?? ""].some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) =>
        (partnerName[a.partnerId] ?? "").localeCompare(partnerName[b.partnerId] ?? "") ||
        Number(b.role === "Primary") - Number(a.role === "Primary") ||
        (a.name || a.email).localeCompare(b.name || b.email)
      );
  }, [users, tab, partnerId, search, partnerName]);

  function act(id: string, fn: () => Promise<ActionResult>, success: string) {
    setBusyId(id);
    start(async () => {
      const r = await fn();
      setBusyId(null);
      setToast(r.ok ? { text: success } : { text: r.error ?? "That didn't work.", error: true });
      if (r.ok) router.refresh();
    });
  }

  function copyLink(u: PartnerUserView) {
    setBusyId(u.id);
    start(async () => {
      const r = await adminCopyInviteLinkAction(u.id);
      setBusyId(null);
      if (!r.ok || !r.data) return setToast({ text: r.ok ? "No link available." : r.error, error: true });
      try {
        await navigator.clipboard.writeText(r.data);
        setToast({ text: "Invite link copied. Only share it with " + u.email + "." });
      } catch {
        setToast({ text: r.data });
      }
    });
  }

  const selectedCompany = companies.find((c) => c.id === partnerId);

  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Active users" value={users.filter((u) => u.status === "Active").length} />
        <Stat label="Pending invitations" value={users.filter((u) => u.status === "Invited").length} tone="amber" />
        <Stat label="Companies with a team" value={companiesWithTeams} />
        <button type="button" onClick={() => setShowNoOwner((s) => !s)} className="text-left">
          <Stat label="Companies without an owner" value={ownerless.length} tone={ownerless.length ? "red" : undefined} action={ownerless.length ? (showNoOwner ? "Hide" : "Review") : undefined} />
        </button>
      </div>

      {showNoOwner && ownerless.length > 0 && (
        <div className="mb-6 rounded-xl border border-red-900/50 bg-red-950/30 p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-red-200">
            <AlertTriangle className="w-4 h-4" /> These companies have no account owner yet
          </div>
          <ul className="divide-y divide-red-900/40">
            {ownerless.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link href={`/admin/marketplace/partners/${c.id}`} className="text-sm font-medium text-white hover:underline">{c.name}</Link>
                  <p className="text-xs text-gray-400">{[c.lifecycle, c.pocName, c.email].filter(Boolean).join(" · ")}</p>
                </div>
                {canManage && (
                  <button type="button" onClick={() => setInvite({ partnerId: c.id, role: "Primary" })} className="text-xs font-semibold text-white bg-red-700/70 hover:bg-red-700 rounded-lg px-3 py-1.5">
                    Invite owner
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit max-w-full overflow-x-auto">
          {(["all", "Active", "Invited", "Removed"] as StatusTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn("px-3.5 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors", tab === t ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white")}
            >
              {t === "all" ? "Current" : t === "Invited" ? "Pending" : t}
              <span className="ml-1.5 text-xs text-gray-500">{counts[t]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email or company"
              className="w-full h-10 pl-9 pr-3 rounded-lg bg-gray-900 border border-gray-800 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-gray-600"
            />
          </div>
          <CompanyPicker companies={companies} value={partnerId} onChange={setPartnerId} placeholder="All companies" />
          {canManage && (
            <button
              type="button"
              onClick={() => setInvite({ partnerId, role: "Member" })}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold whitespace-nowrap"
            >
              <UserPlus className="w-4 h-4" /> Invite user
            </button>
          )}
        </div>
      </div>

      {selectedCompany && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-gray-500">Company</p>
            <Link href={`/admin/marketplace/partners/${selectedCompany.id}`} className="text-white font-semibold hover:underline">{selectedCompany.name}</Link>
            <span className="ml-2 text-xs text-gray-500">{selectedCompany.lifecycle}</span>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setRoutingFor(selectedCompany.id)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 hover:text-emerald-200 border border-emerald-900 bg-emerald-950/40 rounded-lg px-3 py-1.5">
              <Bell className="w-3.5 h-3.5" /> Who gets leads: {selectedCompany.leadRouting === "all" ? "Everyone" : "Selected people"}
            </button>
            <button type="button" onClick={() => setPartnerId("")} className="text-xs text-gray-400 hover:text-white inline-flex items-center gap-1"><X className="w-3.5 h-3.5" /> Clear</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-white font-medium mb-1">No users here yet</p>
            <p className="text-sm text-gray-500">
              {selectedCompany ? `Invite the first person to ${selectedCompany.name}.` : "Partner users show up here when they're invited or sign in to the partner portal."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-800 whitespace-nowrap">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Lead alerts</th>
                  <th className="px-4 py-3 font-medium">Activity</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {rows.map((u) => {
                  const company = partnerName[u.partnerId] ?? "Unknown company";
                  const name = u.name || u.email;
                  const menu: { label: string; onClick: () => void; danger?: boolean }[] = [];
                  if (canManage) {
                    if (u.status === "Invited") {
                      menu.push({ label: u.inviteExpired ? "Send a new invitation" : "Resend invitation", onClick: () => act(u.id, () => adminResendInviteAction(u.id), `Invitation resent to ${u.email}.`) });
                      if (!u.inviteExpired && u.inviteExpiresAt) menu.push({ label: "Copy invite link", onClick: () => copyLink(u) });
                      menu.push({ label: "Cancel invitation", danger: true, onClick: () => setConfirm({ title: "Cancel invitation?", body: `${name}'s invitation link to ${company} will stop working.`, cta: "Cancel invitation", danger: true, run: () => adminRevokeInviteAction(u.id), done: "Invitation cancelled." }) });
                    } else if (u.status === "Active") {
                      if (u.role !== "Primary") menu.push({ label: "Make account owner", onClick: () => setConfirm({ title: `Make ${name} the account owner?`, body: `The current owner of ${company} stays on the team as a member.`, cta: "Make owner", run: () => adminMakePrimaryAction(u.id), done: `${name} now owns ${company}.` }) });
                      menu.push({ label: "Who gets leads…", onClick: () => setRoutingFor(u.partnerId) });
                      menu.push({ label: "Remove from company", danger: true, onClick: () => setConfirm({ title: `Remove ${name} from ${company}?`, body: u.role === "Primary" ? "They're the account owner. You can only remove them if no one else is on the team; otherwise make someone else the owner first." : "They lose access to this partner account right away. You can restore them later from the Removed tab.", cta: "Remove", danger: true, run: () => adminRemoveUserAction(u.id), done: `${name} was removed.` }) });
                    } else {
                      menu.push({ label: u.clerkUserId ? "Restore access" : "Invite again", onClick: () => act(u.id, () => adminRestoreUserAction(u.id), u.clerkUserId ? `${name} has access again.` : `Invitation sent to ${u.email}.`) });
                    }
                  }
                  return (
                    <tr key={u.id} className={cn("align-middle", busyId === u.id && "opacity-50")}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-[220px]">
                          <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0", u.status === "Invited" ? "bg-gray-800 text-gray-500 border border-dashed border-gray-700" : darkAvatar(u.email))}>
                            {u.status === "Invited" ? <Mail className="w-4 h-4" /> : initials(u.name, u.email)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-white font-medium truncate">{name}</p>
                            <p className="text-xs text-gray-500 truncate">{u.name ? u.email : ""}{u.title ? `${u.name ? " · " : ""}${u.title}` : ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setPartnerId(u.partnerId)} className="text-gray-300 hover:text-white hover:underline text-left">{company}</button>
                      </td>
                      <td className="px-4 py-3">
                        {u.role === "Primary" && (u.status === "Active" || u.status === "Invited") ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 bg-amber-950/60 border border-amber-900 rounded-md px-2 py-0.5"><Crown className="w-3 h-3" /> Owner</span>
                        ) : (
                          <span className="text-xs text-gray-400">Member</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap"><StatusBadge u={u} /></td>
                      <td className="px-4 py-3">
                        {u.status === "Active" ? (
                          <button type="button" onClick={() => setRoutingFor(u.partnerId)} title="Who gets leads" className="p-1 -m-1 rounded hover:bg-gray-800">
                            {getsLeads.has(u.id) ? <Bell className="w-4 h-4 text-emerald-400" aria-label="Gets leads" /> : <BellOff className="w-4 h-4 text-gray-600" aria-label="Doesn't get leads" />}
                          </button>
                        ) : <span className="text-gray-700">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {u.status === "Invited"
                          ? <>Invited {relativeDay(u.lastInviteSentAt || u.invitedAt)}{u.invitedByName ? ` by ${u.invitedByName}` : ""}</>
                          : u.status === "Active"
                            ? u.lastActiveAt ? <>Active {relativeDay(u.lastActiveAt)}</> : <>Joined {relativeDay(u.acceptedAt)}</>
                            : <>{u.status === "Revoked" ? "Invite cancelled" : "Removed"} {relativeDay(u.removedAt)}{u.removedByName ? ` by ${u.removedByName}` : ""}</>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {menu.length > 0 && <RowMenu items={menu} disabled={busyId === u.id} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!canManage && (
        <p className="mt-3 text-xs text-gray-500">Only TTT admins can invite, remove or change partner users.</p>
      )}

      {routingFor && (() => {
        const c = companies.find((x) => x.id === routingFor);
        if (!c) return null;
        return (
          <Modal onClose={() => setRoutingFor(null)} label="Who gets leads" wide>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Lead alerts</p>
                <p className="text-white font-semibold">{c.name}</p>
              </div>
              <button type="button" onClick={() => setRoutingFor(null)} aria-label="Close" className="w-8 h-8 -mr-2 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-800"><X className="w-4 h-4" /></button>
            </div>
            <LeadRoutingEditor
              theme="dark"
              members={users.filter((u) => u.partnerId === c.id)}
              routing={c.leadRouting}
              includeBusinessEmail={!c.leadSkipBusinessEmail}
              businessEmail={c.email || undefined}
              canEdit={canManage}
              onSave={(input) => adminSetLeadRoutingAction({ partnerId: c.id, ...input })}
              onSaved={() => { setRoutingFor(null); setToast({ text: `Lead alerts updated for ${c.name}.` }); router.refresh(); }}
            />
          </Modal>
        );
      })()}

      {invite && (
        <InviteDialog
          companies={companies}
          initialPartnerId={invite.partnerId}
          initialRole={invite.role}
          onClose={() => setInvite(null)}
          onSent={(email) => { setInvite(null); setToast({ text: `Invitation sent to ${email}.` }); router.refresh(); }}
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
        <div role="status" className={cn("fixed left-1/2 -translate-x-1/2 bottom-6 z-[60] text-sm px-4 py-2.5 rounded-xl shadow-lg max-w-[90vw] break-all", toast.error ? "bg-red-600 text-white" : "bg-white text-gray-900")}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, action }: { label: string; value: number; tone?: "amber" | "red"; action?: string }) {
  return (
    <div className={cn("rounded-xl border bg-gray-900 px-4 py-3 h-full", tone === "red" ? "border-red-900/60" : "border-gray-800")}>
      <p className="text-xs text-gray-500">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className={cn("text-2xl font-bold", tone === "amber" ? "text-amber-300" : tone === "red" ? "text-red-300" : "text-white")}>{value}</p>
        {action && <span className="text-xs text-red-300 font-medium mb-1">{action}</span>}
      </div>
    </div>
  );
}

function StatusBadge({ u }: { u: PartnerUserView }) {
  if (u.status === "Active") return <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Active</span>;
  if (u.status === "Invited") {
    return u.inviteExpired
      ? <span className="inline-flex items-center gap-1.5 text-xs text-red-300"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />Invite expired</span>
      : <span className="inline-flex items-center gap-1.5 text-xs text-amber-300"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Pending{u.inviteExpiresAt ? ` · ${inviteExpiresIn(u)}` : ""}</span>;
  }
  return <span className="inline-flex items-center gap-1.5 text-xs text-gray-500"><span className="w-1.5 h-1.5 rounded-full bg-gray-600" />{u.status === "Revoked" ? "Cancelled" : "Removed"}</span>;
}

function CompanyPicker({ companies, value, onChange, placeholder, dark = true }: { companies: Company[]; value: string; onChange: (id: string) => void; placeholder: string; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const selected = companies.find((c) => c.id === value);
  const list = companies.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 60);

  return (
    <div ref={ref} className="relative sm:w-64">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn("w-full h-10 px-3 rounded-lg border text-sm flex items-center justify-between gap-2", dark ? "bg-gray-900 border-gray-800 text-white" : "bg-gray-800 border-gray-700 text-white")}
      >
        <span className={cn("truncate", !selected && "text-gray-500")}>{selected?.name ?? placeholder}</span>
        <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[260px] rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
          <div className="p-2 border-b border-gray-800">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies" className="w-full h-9 px-2.5 rounded-md bg-gray-800 border border-gray-700 text-sm text-white placeholder:text-gray-500 focus:outline-none" />
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {placeholder === "All companies" && (
              <li><button type="button" onClick={() => { onChange(""); setOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-800">All companies</button></li>
            )}
            {list.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => { onChange(c.id); setOpen(false); setQ(""); }} className={cn("w-full text-left px-3 py-2 text-sm hover:bg-gray-800", c.id === value ? "text-white bg-gray-800" : "text-gray-300")}>
                  {c.name}
                  <span className="ml-2 text-xs text-gray-500">{c.lifecycle}</span>
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function RowMenu({ items, disabled }: { items: { label: string; onClick: () => void; danger?: boolean }[]; disabled?: boolean }) {
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
  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-label="Actions" aria-expanded={open} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-800 disabled:opacity-40">
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 w-52 rounded-lg border border-gray-700 bg-gray-900 shadow-xl py-1 text-left">
          {items.map((i) => (
            <button key={i.label} type="button" onClick={() => { setOpen(false); i.onClick(); }} className={cn("w-full text-left px-3 py-2 text-sm hover:bg-gray-800", i.danger ? "text-red-400" : "text-gray-200")}>
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Modal({ children, onClose, label, wide }: { children: React.ReactNode; onClose: () => void; label: string; wide?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={label} className={cn("w-full rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl p-6 max-h-[90dvh] overflow-y-auto", wide ? "max-w-xl" : "max-w-md")}>
        {children}
      </div>
    </div>
  );
}

function InviteDialog({ companies, initialPartnerId, initialRole, onClose, onSent }: {
  companies: Company[];
  initialPartnerId: string;
  initialRole: "Primary" | "Member";
  onClose: () => void;
  onSent: (email: string) => void;
}) {
  const [partnerId, setPartnerId] = useState(initialPartnerId);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState<"Primary" | "Member">(initialRole);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!partnerId) return setError("Pick a company.");
    setError("");
    start(async () => {
      const r = await adminInviteUserAction({ partnerId, name, email, title: title || undefined, role });
      if (r.ok) onSent(email.trim().toLowerCase());
      else setError(r.error);
    });
  }

  const input = "w-full h-10 px-3 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-gray-500";
  return (
    <Modal onClose={onClose} label="Invite partner user">
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-lg font-bold text-white">Invite a partner user</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 -mr-2 -mt-1 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-800"><X className="w-4 h-4" /></button>
      </div>
      <p className="text-sm text-gray-400 mb-5">They&rsquo;ll get an email to join the company&rsquo;s partner account.</p>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <span className="block text-xs font-semibold text-gray-400 mb-1">Company</span>
          <CompanyPicker companies={companies} value={partnerId} onChange={setPartnerId} placeholder="Choose a company" dark={false} />
        </div>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-400 mb-1">Name</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-400 mb-1">Email</span>
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-400 mb-1">Job title <span className="font-normal text-gray-500">(optional)</span></span>
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
        </label>
        <div>
          <span className="block text-xs font-semibold text-gray-400 mb-1">Role</span>
          <div className="grid grid-cols-2 gap-2">
            {(["Member", "Primary"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={cn("rounded-lg border px-3 py-2.5 text-left transition-colors", role === r ? "border-emerald-500 bg-emerald-950/40" : "border-gray-700 hover:border-gray-600")}
              >
                <p className="text-sm font-semibold text-white flex items-center gap-1.5">{r === "Primary" ? <><Crown className="w-3.5 h-3.5 text-amber-300" /> Account owner</> : "Member"}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{r === "Primary" ? "Manages the team. Replaces the current owner when they join." : "Sees leads and edits the listing."}</p>
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 h-10 rounded-lg border border-gray-700 text-sm font-semibold text-gray-300 hover:bg-gray-800">Cancel</button>
          <button type="submit" disabled={pending} className="flex-1 h-10 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-60">
            {pending ? "Sending…" : "Send invitation"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ConfirmDialog({ c, onClose, onDone }: { c: Confirm; onClose: () => void; onDone: (r: ActionResult) => void }) {
  const [pending, start] = useTransition();
  return (
    <Modal onClose={onClose} label={c.title}>
      <h2 className="text-lg font-bold text-white mb-2">{c.title}</h2>
      <p className="text-sm text-gray-400 leading-relaxed mb-6">{c.body}</p>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 h-10 rounded-lg border border-gray-700 text-sm font-semibold text-gray-300 hover:bg-gray-800">Never mind</button>
        <button type="button" disabled={pending} onClick={() => start(async () => onDone(await c.run()))} className={cn("flex-1 h-10 rounded-lg text-white text-sm font-semibold disabled:opacity-60", c.danger ? "bg-red-600 hover:bg-red-500" : "bg-emerald-600 hover:bg-emerald-500")}>
          {pending ? "Working…" : c.cta}
        </button>
      </div>
    </Modal>
  );
}
