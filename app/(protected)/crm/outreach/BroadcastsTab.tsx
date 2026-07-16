"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { OutreachTemplate, OutreachSequence, OutreachContactType } from "@/lib/types";
import type { ReferralCompany, StaffMember } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────
interface MetricsRecipient {
  contactName: string;
  contactEmail: string;
  status: "Sent" | "Failed" | "Pending";
  errorMessage: string;
  openedAt: string | null;
  clickedAt: string | null;
  clickedUrl: string | null;
}

interface BroadcastMetrics {
  recipients: MetricsRecipient[];
  stats: { sent: number; failed: number; opened: number; clicked: number; total: number };
}

interface BroadcastSummary {
  id: string;
  name: string;
  recipientCount: number;
  sentAt: string;
  channel: "Email" | "SMS";
  sentCount?: number;
  failedCount?: number;
  status: "Active" | "Archived";
}

interface AudienceFilter {
  contactType: OutreachContactType;
  stages: string[];
  tags: string;
  companyIds: string[];
  ownerClerkId: string;
  excludeOptout: boolean;
}

interface ContactItem {
  id: string;
  name: string;
  email: string;
}

const REFERRAL_STAGES = [
  "Identified", "Met", "Agreed to Refer", "Shared Leads",
  "Active Referral", "Inactive Referral",
];

const EMPTY_FILTER: AudienceFilter = {
  contactType: "ReferralContacts",
  stages: [],
  tags: "",
  companyIds: [],
  ownerClerkId: "",
  excludeOptout: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function timeAgo(iso: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(iso);
}

// ─── CompanyMultiselect ───────────────────────────────────────────────────────
function CompanyMultiselect({
  companies, value, onChange,
}: {
  companies: ReferralCompany[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) && !value.includes(c.id)
  ).slice(0, 40);

  const selected = companies.filter(c => value.includes(c.id));

  return (
    <div ref={ref} className="relative">
      {/* Selected tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {selected.map(c => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-forest-50 border border-forest-200 px-2 py-0.5 text-xs text-forest-700">
              {c.name}
              <button
                type="button"
                onClick={() => onChange(value.filter(id => id !== c.id))}
                className="text-forest-400 hover:text-forest-700 ml-0.5 leading-none"
              >×</button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={selected.length ? "Add another company…" : "Search companies…"}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onChange([...value, c.id]); setSearch(""); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ContactPicker ────────────────────────────────────────────────────────────
function ContactPicker({
  contactType, ownerClerkId, companies, staffMembers, selectedIds, onChange,
}: {
  contactType: OutreachContactType;
  ownerClerkId: string;
  companies: ReferralCompany[];
  staffMembers: StaffMember[];
  selectedIds: Set<string>;
  onChange: (ids: Set<string>) => void;
}) {
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    // Derive companyIds from ownerClerkId for referral contacts
    const companyIds = contactType === "ReferralContacts" && ownerClerkId
      ? companies.filter(c => c.assignedToClerkId === ownerClerkId).map(c => c.id)
      : [];
    fetch("/api/outreach/contacts-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactType,
        companyIds: companyIds.length ? companyIds : undefined,
        assignedToClerkId: contactType === "ClientContacts" && ownerClerkId ? ownerClerkId : undefined,
        excludeOptout: false,
      }),
    })
      .then(r => r.json())
      .then(data => setContacts(data.contacts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactType, ownerClerkId]);

  const displayed = useMemo(() => {
    if (!search) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }, [contacts, search]);

  function toggleAll(checked: boolean) {
    if (checked) {
      onChange(new Set([...selectedIds, ...displayed.map(c => c.id)]));
    } else {
      const removing = new Set(displayed.map(c => c.id));
      onChange(new Set([...selectedIds].filter(id => !removing.has(id))));
    }
  }

  const allChecked = displayed.length > 0 && displayed.every(c => selectedIds.has(c.id));

  return (
    <div className="space-y-2">
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
        />
      </div>

      {loading ? (
        <div className="text-center py-6 text-sm text-gray-400">Loading contacts…</div>
      ) : (
        <>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={e => toggleAll(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 accent-forest-600"
              />
              <span className="text-xs font-medium text-gray-600">
                {displayed.length} contact{displayed.length !== 1 ? "s" : ""}
                {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
              </span>
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-gray-100">
              {displayed.length === 0 ? (
                <div className="text-center py-6 text-sm text-gray-400">No contacts found</div>
              ) : displayed.map(c => (
                <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={e => {
                      const next = new Set(selectedIds);
                      e.target.checked ? next.add(c.id) : next.delete(c.id);
                      onChange(next);
                    }}
                    className="h-3.5 w-3.5 rounded border-gray-300 accent-forest-600 flex-shrink-0"
                  />
                  <span className="text-sm text-gray-800 truncate">{c.name}</span>
                  <span className="text-xs text-gray-400 truncate ml-auto">{c.email}</span>
                </label>
              ))}
            </div>
          </div>
          {contacts.length >= 200 && (
            <p className="text-xs text-gray-400">Showing first 200 contacts. Use filters to narrow down.</p>
          )}
        </>
      )}
    </div>
  );
}

// ─── AttachmentUpload ─────────────────────────────────────────────────────────
function AttachmentUpload({ url, name, onChange }: {
  url: string;
  name: string;
  onChange: (url: string, name: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tenantId", "outreach");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && data.photoUrl) onChange(data.photoUrl, file.name);
    } catch { /* ignore */ } finally { setUploading(false); }
  }

  if (url) return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
      </svg>
      <span className="text-sm text-gray-700 truncate flex-1 min-w-0">{name}</span>
      <button type="button" onClick={() => onChange("", "")} className="text-gray-400 hover:text-gray-600 shrink-0 text-lg leading-none">×</button>
    </div>
  );

  return (
    <>
      <input ref={ref} type="file" className="sr-only" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ""; }} />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors disabled:opacity-50 w-full"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
        {uploading ? "Uploading…" : "Attach a file (optional)"}
      </button>
    </>
  );
}

// ─── AI Prompt Panel ──────────────────────────────────────────────────────────
function AiPromptPanel({
  channel, senderName, onGenerated, onClose,
}: {
  channel: "Email" | "SMS";
  senderName: string;
  onGenerated: (subject: string, body: string) => void;
  onClose: () => void;
}) {
  const [gist, setGist] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    if (!gist.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/outreach/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gist: gist.trim(), channel, senderName }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Generation failed"); return; }
      onGenerated(data.subject ?? "", data.body ?? "");
      onClose();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span className="text-sm font-semibold text-amber-800">Prompt with AI</span>
        </div>
        <button onClick={onClose} className="text-amber-400 hover:text-amber-700 text-sm leading-none">×</button>
      </div>
      <textarea
        value={gist}
        onChange={e => setGist(e.target.value)}
        placeholder="Type the gist of what you want to say — e.g. 'Following up on our coffee meeting. Remind them we have a referral program and ask if they have any upcoming clients moving or downsizing.'"
        className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
        rows={4}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center justify-between">
        <p className="text-xs text-amber-700 max-w-xs">AI will write on-brand copy and insert <code className="bg-amber-100 px-1 rounded">{"{{first_name}}"}</code>, <code className="bg-amber-100 px-1 rounded">{"{{company}}"}</code>, etc.</p>
        <button
          onClick={generate}
          disabled={loading || !gist.trim()}
          className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {loading ? (
            <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Generating…</>
          ) : "Generate"}
        </button>
      </div>
    </div>
  );
}

// ─── Metrics Accordion ───────────────────────────────────────────────────────
function StatPill({ label, value, total, color }: {
  label: string; value: number; total: number; color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-1 min-w-[80px]">
      <div className="relative w-14 h-14">
        <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="15.9" fill="none"
            stroke={color} strokeWidth="3"
            strokeDasharray={`${pct} ${100 - pct}`}
            strokeDashoffset="0"
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-gray-800">{pct}%</span>
      </div>
      <div className="text-center">
        <div className="text-xs font-medium text-gray-700">{value.toLocaleString()}</div>
        <div className="text-xs text-gray-400">{label}</div>
      </div>
    </div>
  );
}

function BroadcastMetricsAccordion({ broadcastId, channel }: { broadcastId: string; channel: "Email" | "SMS" }) {
  const [data, setData] = useState<BroadcastMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/outreach/broadcasts/${broadcastId}/metrics`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [broadcastId]);

  if (loading) return (
    <div className="px-6 py-4 text-sm text-gray-400 animate-pulse">Loading metrics…</div>
  );
  if (error) return (
    <div className="px-6 py-4 text-sm text-red-500">{error}</div>
  );
  if (!data) return null;

  const { stats, recipients } = data;
  const isEmail = channel === "Email";

  return (
    <div className="bg-gray-50 border-t border-gray-100 px-6 py-5 space-y-5">
      {/* Stats row */}
      <div className="flex items-start gap-6 flex-wrap">
        <StatPill label="Delivered" value={stats.sent} total={stats.total} color="#16a34a" />
        {isEmail && (
          <>
            <StatPill label="Opened" value={stats.opened} total={stats.sent || 1} color="#2563eb" />
            <StatPill label="Clicked" value={stats.clicked} total={stats.sent || 1} color="#7c3aed" />
          </>
        )}
        {stats.failed > 0 && (
          <StatPill label="Failed" value={stats.failed} total={stats.total} color="#dc2626" />
        )}
        {isEmail && (
          <p className="self-end text-xs text-gray-400 max-w-[180px] pb-1">
            Open rates may be inflated for Apple Mail users due to Mail Privacy Protection.
          </p>
        )}
      </div>

      {/* Per-recipient table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Recipient</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              {isEmail && <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Opened</th>}
              {isEmail && <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Clicked</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {recipients.map((r, i) => (
              <tr key={i} className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-800 truncate max-w-[160px]">{r.contactName}</div>
                  <div className="text-gray-400 truncate max-w-[160px]">{r.contactEmail}</div>
                </td>
                <td className="px-3 py-2">
                  {r.status === "Sent" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Delivered</span>
                  ) : r.status === "Failed" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700" title={r.errorMessage}>Failed</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Pending</span>
                  )}
                </td>
                {isEmail && (
                  <td className="px-3 py-2 hidden sm:table-cell text-gray-600">
                    {r.openedAt ? (
                      <span className="text-blue-600 font-medium">{timeAgo(r.openedAt)}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                )}
                {isEmail && (
                  <td className="px-3 py-2 hidden md:table-cell">
                    {r.clickedUrl ? (
                      <a
                        href={r.clickedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-600 hover:text-violet-800 underline truncate max-w-[200px] inline-block"
                        title={r.clickedUrl}
                      >
                        {new URL(r.clickedUrl).hostname}
                      </a>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Broadcasts list ──────────────────────────────────────────────────────────
type BcastSortCol = "name" | "channel" | "recipients" | "delivered" | "failed" | "sent";

function BroadcastsList({ broadcasts: initialBroadcasts, loading, onNew }: {
  broadcasts: BroadcastSummary[];
  loading: boolean;
  onNew: () => void;
}) {
  const [broadcasts, setBroadcasts] = useState<BroadcastSummary[]>(initialBroadcasts);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<"All" | "Email" | "SMS">("All");
  const [deliveryFilter, setDeliveryFilter] = useState<"all" | "ok" | "failures">("all");
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<{ col: BcastSortCol; dir: "asc" | "desc" }>({ col: "sent", dir: "desc" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<BroadcastSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Keep in sync when parent reloads
  useEffect(() => { setBroadcasts(initialBroadcasts); }, [initialBroadcasts]);

  function toggleSort(col: BcastSortCol) {
    setSort(s => s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "desc" });
  }

  async function handleArchive(b: BroadcastSummary) {
    const newStatus = b.status === "Archived" ? "Active" : "Archived";
    setActioning(b.id);
    try {
      const res = await fetch(`/api/outreach/sequences/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setBroadcasts(prev => prev.map(x => x.id === b.id ? { ...x, status: newStatus } : x));
      }
    } finally {
      setActioning(null);
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/outreach/sequences/${deleteConfirm.id}`, { method: "DELETE" });
      if (res.ok) {
        setBroadcasts(prev => prev.filter(x => x.id !== deleteConfirm.id));
        setDeleteConfirm(null);
      }
    } finally {
      setDeleting(false);
    }
  }

  const archivedCount = broadcasts.filter(b => b.status === "Archived").length;

  const filtered = broadcasts.filter(b => {
    if (!showArchived && b.status === "Archived") return false;
    if (showArchived && b.status !== "Archived") return false;
    if (search && !b.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (channelFilter !== "All" && b.channel !== channelFilter) return false;
    if (deliveryFilter === "ok" && (b.failedCount ?? 0) > 0) return false;
    if (deliveryFilter === "failures" && (b.failedCount ?? 0) === 0) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sort.col) {
      case "name": cmp = a.name.localeCompare(b.name); break;
      case "channel": cmp = a.channel.localeCompare(b.channel); break;
      case "recipients": cmp = a.recipientCount - b.recipientCount; break;
      case "delivered": cmp = (a.sentCount ?? -1) - (b.sentCount ?? -1); break;
      case "failed": cmp = (a.failedCount ?? -1) - (b.failedCount ?? -1); break;
      case "sent": cmp = a.sentAt.localeCompare(b.sentAt); break;
    }
    return sort.dir === "asc" ? cmp : -cmp;
  });

  function SortTh({ col, label, className }: { col: BcastSortCol; label: string; className?: string }) {
    const active = sort.col === col;
    return (
      <th
        className={cn("px-4 py-3 cursor-pointer select-none whitespace-nowrap group", className)}
        onClick={() => toggleSort(col)}
      >
        <span className="flex items-center gap-1">
          {label}
          <span className={cn("text-xs transition-colors", active ? "text-forest-600" : "text-gray-300 group-hover:text-gray-400")}>
            {active ? (sort.dir === "asc" ? "▲" : "▼") : "▲▼"}
          </span>
        </span>
      </th>
    );
  }

  const activeCount = broadcasts.filter(b => b.status !== "Archived").length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">One-time sends to a filtered or hand-picked list of contacts.</p>
        <button
          onClick={onNew}
          className="shrink-0 rounded-lg bg-forest-600 px-4 py-2 text-sm font-medium text-white hover:bg-forest-700 transition-colors"
        >
          + New Broadcast
        </button>
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="Search broadcasts…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-40 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
        />
        <select
          value={channelFilter}
          onChange={e => setChannelFilter(e.target.value as "All" | "Email" | "SMS")}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
        >
          <option value="All">All channels</option>
          <option value="Email">Email</option>
          <option value="SMS">SMS</option>
        </select>
        {!showArchived && (
          <select
            value={deliveryFilter}
            onChange={e => setDeliveryFilter(e.target.value as "all" | "ok" | "failures")}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
          >
            <option value="all">All statuses</option>
            <option value="ok">Fully delivered</option>
            <option value="failures">Has failures</option>
          </select>
        )}
        {archivedCount > 0 && (
          <button
            onClick={() => setShowArchived(v => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              showArchived
                ? "border-forest-300 bg-forest-50 text-forest-700"
                : "border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700"
            )}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12" />
            </svg>
            {showArchived ? "Hide archived" : `Archived (${archivedCount})`}
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
      ) : activeCount === 0 && !showArchived ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center">
          <p className="text-sm text-gray-500">No broadcasts yet.</p>
          <button onClick={onNew} className="mt-3 text-sm text-forest-600 hover:text-forest-700 font-medium">
            Send your first broadcast →
          </button>
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-10 text-center">
          <p className="text-sm text-gray-500">No broadcasts match your filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
              <tr>
                <SortTh col="name" label="Name" />
                <SortTh col="channel" label="Channel" />
                <SortTh col="recipients" label="Recipients" />
                <SortTh col="delivered" label="Delivered" className="hidden sm:table-cell" />
                <SortTh col="failed" label="Failed" className="hidden sm:table-cell" />
                <SortTh col="sent" label="Sent" className="hidden md:table-cell" />
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="bg-white">
              {sorted.map(b => {
                const hasFailed = (b.failedCount ?? 0) > 0;
                const hasTracking = b.sentCount !== undefined;
                const isArchived = b.status === "Archived";
                const isBusy = actioning === b.id;
                const isExpanded = expandedId === b.id;
                return (
                  <>
                    <tr
                      key={b.id}
                      onClick={e => {
                        // Don't expand when clicking action buttons
                        if ((e.target as HTMLElement).closest("button")) return;
                        setExpandedId(isExpanded ? null : b.id);
                      }}
                      className={cn(
                        "group transition-colors cursor-pointer border-b border-gray-100",
                        isArchived ? "bg-gray-50 opacity-60 hover:opacity-80" : "hover:bg-gray-50",
                        isExpanded && "bg-gray-50"
                      )}
                    >
                      <td className="px-4 py-3 font-medium max-w-xs">
                        <div className="flex items-center gap-2">
                          <svg
                            className={cn("w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform", isExpanded && "rotate-90")}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                          <span className={cn("truncate", isArchived ? "text-gray-500" : "text-gray-900")}>{b.name}</span>
                          {isArchived && (
                            <span className="shrink-0 inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">archived</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          b.channel === "Email" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700",
                          isArchived && "opacity-60"
                        )}>
                          {b.channel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{b.recipientCount.toLocaleString()}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {hasTracking
                          ? <span className={cn("font-medium", isArchived ? "text-gray-400" : "text-green-700")}>{b.sentCount!.toLocaleString()}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {hasTracking
                          ? hasFailed
                            ? <span className={cn("font-medium", isArchived ? "text-gray-400" : "text-red-600")}>{b.failedCount!.toLocaleString()}</span>
                            : <span className="text-gray-400">0</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-gray-500">{timeAgo(b.sentAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleArchive(b)}
                            disabled={isBusy}
                            title={isArchived ? "Unarchive" : "Archive"}
                            className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-40 transition-colors"
                          >
                            {isArchived ? (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 11l3-3m0 0l3 3m-3-3v8m-6 1h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12" />
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(b)}
                            disabled={isBusy}
                            title="Delete"
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${b.id}-metrics`} className="border-b border-gray-100">
                        <td colSpan={7} className="p-0">
                          <BroadcastMetricsAccordion broadcastId={b.id} channel={b.channel} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
            {sorted.length} broadcast{sorted.length !== 1 ? "s" : ""}
            {showArchived ? " archived" : ` · ${archivedCount} archived`}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Delete broadcast?</h3>
            <p className="text-sm text-gray-500 mb-1">
              <span className="font-medium text-gray-700">&ldquo;{deleteConfirm.name}&rdquo;</span> will be permanently removed.
            </p>
            <p className="text-xs text-gray-400 mb-6">This cannot be undone. Consider archiving instead if you may need to reference it later.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Compose wizard ───────────────────────────────────────────────────────────
interface ComposeProps {
  templates: OutreachTemplate[];
  companies: ReferralCompany[];
  staffMembers: StaffMember[];
  currentUserId: string;
  hasSendScope: boolean;
  gmailEmail?: string;
  onDone: (broadcast: BroadcastSummary) => void;
  onCancel: () => void;
}

function ComposeWizard({
  templates, companies, staffMembers, currentUserId,
  hasSendScope, gmailEmail, onDone, onCancel,
}: ComposeProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [broadcastName, setBroadcastName] = useState("");
  const [filter, setFilter] = useState<AudienceFilter>(EMPTY_FILTER);
  const [audienceMode, setAudienceMode] = useState<"filter" | "manual">("filter");
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ count: number; sample: string[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Step 2
  const [channel, setChannel] = useState<"Email" | "SMS">("Email");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [emailType, setEmailType] = useState<"text" | "branded">("text");
  const [ctaLink, setCtaLink] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [brandedHtml, setBrandedHtml] = useState("");
  const [brandedGist, setBrandedGist] = useState("");
  const [generatingBranded, setGeneratingBranded] = useState(false);
  const [brandedError, setBrandedError] = useState("");

  // Step 3 / result
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sendSuccess, setSendSuccess] = useState<{ count: number } | null>(null);

  const emailTemplates = templates.filter(t => t.channel === "Email");
  const smsTemplates = templates.filter(t => t.channel === "SMS");
  const relevantTemplates = channel === "Email" ? emailTemplates : smsTemplates;
  const salesStaff = staffMembers.filter(s => ["TTTSales", "TTTAdmin", "TTTManager"].includes(s.role ?? ""));
  const currentUser = staffMembers.find(s => s.clerkUserId === currentUserId);
  const senderName = currentUser?.displayName || "Top Tier Transitions";

  function applyTemplate(id: string) {
    setSelectedTemplateId(id);
    const t = templates.find(t => t.id === id);
    if (!t) return;
    setSubject(t.subject);
    const tType = t.emailType ?? "text";
    setEmailType(tType);
    if (tType === "branded") {
      setBrandedHtml(t.body);
      setBodyText("");
    } else {
      setBodyText(t.body);
      setBrandedHtml("");
    }
    setCtaLink(t.ctaLink ?? "");
    setCtaLabel(t.ctaLabel ?? "");
    setAttachmentUrl(t.attachmentUrl ?? "");
    setAttachmentName(t.attachmentUrl ? "Attached file" : "");
  }

  // Build the filter payload for the API
  function buildApiFilter() {
    if (audienceMode === "manual" && selectedContactIds.size > 0) {
      return {
        contactType: filter.contactType,
        contactIds: [...selectedContactIds],
        excludeOptout: filter.excludeOptout,
      };
    }
    const base = {
      contactType: filter.contactType,
      stages: filter.stages.length ? filter.stages : undefined,
      tags: filter.tags || undefined,
      excludeOptout: filter.excludeOptout,
    };
    if (filter.contactType === "ClientContacts") {
      return { ...base, assignedToClerkId: filter.ownerClerkId || undefined };
    }
    // For ReferralContacts, resolve ownerClerkId → companyIds intersection
    let companyIds = [...filter.companyIds];
    if (filter.ownerClerkId) {
      const ownerCompanyIds = companies
        .filter(c => c.assignedToClerkId === filter.ownerClerkId)
        .map(c => c.id);
      companyIds = companyIds.length
        ? companyIds.filter(id => ownerCompanyIds.includes(id))
        : ownerCompanyIds;
    }
    return { ...base, companyIds: companyIds.length ? companyIds : undefined };
  }

  const fetchPreview = useCallback(async () => {
    if (audienceMode === "manual") {
      setPreview({ count: selectedContactIds.size, sample: [] });
      return;
    }
    setPreviewing(true);
    setPreview(null);
    try {
      const res = await fetch("/api/outreach/contacts-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildApiFilter()),
      });
      const data = await res.json();
      setPreview(data);
    } finally {
      setPreviewing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, audienceMode, selectedContactIds]);

  async function handleSend() {
    const isBranded = emailType === "branded";
    if (!broadcastName.trim()) return;
    if (isBranded && !brandedHtml) return;
    if (!isBranded && !bodyText.trim()) return;
    setSending(true);
    setError("");

    const finalBodyHtml = isBranded
      ? brandedHtml
      : (channel === "Email"
        ? (ctaLink ? bodyText + `\n\n${ctaLabel || "Click here"}: ${ctaLink}` : bodyText).replace(/\n/g, "<br>")
        : bodyText);

    try {
      const res = await fetch("/api/outreach/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: broadcastName,
          filter: buildApiFilter(),
          subject,
          bodyHtml: finalBodyHtml,
          templateId: selectedTemplateId || undefined,
          channel,
          ctaLink: ctaLink || undefined,
          ctaLabel: ctaLabel || undefined,
          attachmentUrl: attachmentUrl || undefined,
        }),
        signal: AbortSignal.timeout(30000),
      });
      let data: Record<string, unknown> = {};
      try { data = await res.json(); } catch { /* non-JSON body */ }
      if (!res.ok) {
        setError((data.error as string) ?? `Server error (${res.status}). Please try again.`);
        return;
      }
      const broadcast = data.broadcast as BroadcastSummary;
      setSendSuccess({ count: broadcast.recipientCount });
      onDone(broadcast);
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        setError("Request timed out. The server may still be processing — check your inbox for a confirmation email.");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      }
    } finally {
      setSending(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent";

  // ── Success screen ──
  if (sendSuccess) {
    return (
      <div className="max-w-lg mx-auto text-center py-12 space-y-4">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Broadcast sent!</h2>
        <p className="text-sm text-gray-500">
          <strong className="text-gray-700">{broadcastName}</strong> is on its way to{" "}
          <strong className="text-gray-700">{sendSuccess.count} contact{sendSuccess.count !== 1 ? "s" : ""}</strong>.
          A confirmation email will land in your inbox once all messages have been processed.
        </p>
        <button
          onClick={onCancel}
          className="mt-4 rounded-lg bg-forest-600 px-5 py-2 text-sm font-medium text-white hover:bg-forest-700 transition-colors"
        >
          Back to Broadcasts
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {([1, 2, 3] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-8 bg-gray-200" />}
            <div className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
              step === s ? "bg-forest-600 text-white"
                : step > s ? "bg-forest-100 text-forest-700"
                : "bg-gray-100 text-gray-400"
            )}>
              {step > s ? "✓" : s}
            </div>
            <span className={cn("text-xs font-medium hidden sm:block", step === s ? "text-forest-700" : "text-gray-400")}>
              {s === 1 ? "Audience" : s === 2 ? "Message" : "Review & Send"}
            </span>
          </div>
        ))}
        <button onClick={onCancel} className="ml-auto text-xs text-gray-400 hover:text-gray-600">
          Cancel
        </button>
      </div>

      {/* ── Step 1: Audience ── */}
      {step === 1 && (
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Broadcast name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={broadcastName}
              onChange={e => setBroadcastName(e.target.value)}
              className={inputCls}
              placeholder="e.g. April newsletter — active referrals"
            />
          </div>

          {/* Contact type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Contact type</label>
            <div className="flex gap-4">
              {(["ReferralContacts", "ClientContacts"] as OutreachContactType[]).map(ct => (
                <label key={ct} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="contactType"
                    value={ct}
                    checked={filter.contactType === ct}
                    onChange={() => {
                      setFilter(f => ({ ...f, contactType: ct, stages: [], companyIds: [], ownerClerkId: "" }));
                      setSelectedContactIds(new Set());
                      setPreview(null);
                    }}
                    className="accent-forest-600"
                  />
                  <span className="text-sm text-gray-700">
                    {ct === "ReferralContacts" ? "Referral Partners" : "Clients"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Sales Owner filter — both contact types */}
          {salesStaff.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sales owner</label>
              <select
                value={filter.ownerClerkId}
                onChange={e => setFilter(f => ({ ...f, ownerClerkId: e.target.value }))}
                className={inputCls}
              >
                <option value="">All owners</option>
                <option value={currentUserId}>Me only</option>
                {salesStaff.filter(s => s.clerkUserId !== currentUserId).map(s => (
                  <option key={s.clerkUserId} value={s.clerkUserId}>{s.displayName}</option>
                ))}
              </select>
            </div>
          )}

          {/* Audience mode toggle */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Build audience by</label>
            <div className="flex gap-1 p-1 rounded-lg bg-gray-100 w-fit">
              {(["filter", "manual"] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setAudienceMode(m); setPreview(null); }}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    audienceMode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  {m === "filter" ? "Filters" : "Pick contacts"}
                </button>
              ))}
            </div>
          </div>

          {/* Filter mode */}
          {audienceMode === "filter" && (
            <div className="space-y-4 pl-0">
              {filter.contactType === "ReferralContacts" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">Stage (leave blank for all)</label>
                    <div className="flex flex-wrap gap-2">
                      {REFERRAL_STAGES.map(s => (
                        <label key={s} className={cn(
                          "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border cursor-pointer transition-colors",
                          filter.stages.includes(s)
                            ? "bg-forest-600 text-white border-forest-600"
                            : "bg-white text-gray-600 border-gray-300 hover:border-forest-400"
                        )}>
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={filter.stages.includes(s)}
                            onChange={e => setFilter(f => ({
                              ...f,
                              stages: e.target.checked ? [...f.stages, s] : f.stages.filter(x => x !== s),
                            }))}
                          />
                          {s}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Companies (leave blank for all)</label>
                    <CompanyMultiselect
                      companies={companies}
                      value={filter.companyIds}
                      onChange={ids => setFilter(f => ({ ...f, companyIds: ids }))}
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tags contain</label>
                <input
                  type="text"
                  value={filter.tags}
                  onChange={e => setFilter(f => ({ ...f, tags: e.target.value }))}
                  className={inputCls}
                  placeholder="e.g. newsletter"
                />
              </div>
            </div>
          )}

          {/* Manual pick mode */}
          {audienceMode === "manual" && (
            <ContactPicker
              contactType={filter.contactType}
              ownerClerkId={filter.ownerClerkId}
              companies={companies}
              staffMembers={staffMembers}
              selectedIds={selectedContactIds}
              onChange={setSelectedContactIds}
            />
          )}

          {/* Exclude optout */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filter.excludeOptout}
              onChange={e => setFilter(f => ({ ...f, excludeOptout: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 accent-forest-600"
            />
            <span className="text-sm text-gray-700">Exclude opted-out contacts</span>
          </label>

          {/* Preview */}
          {audienceMode === "filter" && (
            <div className="flex items-center gap-3">
              <button
                onClick={fetchPreview}
                disabled={previewing}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {previewing ? "Counting…" : "Preview audience"}
              </button>
              {preview && (
                <span className={cn("text-sm font-medium", preview.count === 0 ? "text-red-600" : "text-forest-700")}>
                  {preview.count === 0
                    ? "No contacts match"
                    : `${preview.count} contact${preview.count === 1 ? "" : "s"}${preview.sample.length ? ` — e.g. ${preview.sample.slice(0, 3).join(", ")}` : ""}`}
                </span>
              )}
            </div>
          )}

          {audienceMode === "manual" && selectedContactIds.size > 0 && (
            <p className="text-sm font-medium text-forest-700">{selectedContactIds.size} contact{selectedContactIds.size !== 1 ? "s" : ""} selected</p>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setStep(2)}
              disabled={
                !broadcastName.trim() ||
                (audienceMode === "manual" && selectedContactIds.size === 0)
              }
              className="rounded-lg bg-forest-600 px-5 py-2 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50 transition-colors"
            >
              Next: Message →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Message ── */}
      {step === 2 && (
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Channel</label>
            <div className="flex gap-4">
              {(["Email", "SMS"] as const).map(ch => (
                <label key={ch} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="channel"
                    value={ch}
                    checked={channel === ch}
                    onChange={() => { setChannel(ch); setSelectedTemplateId(""); setEmailType("text"); }}
                    className="accent-forest-600"
                  />
                  <span className="text-sm text-gray-700">
                    {ch === "Email" ? "Email (via Gmail)" : "SMS — manual task created"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Email format toggle */}
          {channel === "Email" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Email format</label>
              <div className="flex gap-1 p-1 rounded-lg bg-gray-100 w-fit">
                {(["text", "branded"] as const).map(t => (
                  <button key={t} type="button"
                    onClick={() => { setEmailType(t); setBrandedError(""); }}
                    className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                      emailType === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    )}
                  >
                    {t === "text" ? "Text Email" : "✦ Branded Email"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {relevantTemplates.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start from template (optional)</label>
              <select
                value={selectedTemplateId}
                onChange={e => applyTemplate(e.target.value)}
                className={inputCls}
              >
                <option value="">— Write from scratch —</option>
                {relevantTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Text email mode */}
          {emailType === "text" && (
            <>
              {/* AI prompt panel */}
              {showAiPrompt ? (
                <AiPromptPanel
                  channel={channel}
                  senderName={senderName}
                  onGenerated={(s, b) => { setSubject(s); setBodyText(b); }}
                  onClose={() => setShowAiPrompt(false)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAiPrompt(true)}
                  className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Prompt with AI
                </button>
              )}

              {channel === "Email" && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Subject <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className={inputCls}
                    placeholder="e.g. Quick update from Top Tier"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {channel === "Email" ? "Body" : "SMS message"} <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={bodyText}
                  onChange={e => setBodyText(e.target.value)}
                  className={inputCls}
                  rows={12}
                  placeholder={channel === "Email"
                    ? "Hi {{first_name}},\n\nI wanted to reach out…"
                    : "Hi {{first_name}}, just following up from Top Tier…"}
                />
                <p className="mt-1 text-xs text-gray-400">
                  Merge tags: <code>{"{{first_name}}"}</code> <code>{"{{last_name}}"}</code> <code>{"{{company}}"}</code> <code>{"{{rep_first_name}}"}</code>
                </p>
              </div>
            </>
          )}

          {/* Branded email mode */}
          {emailType === "branded" && channel === "Email" && (
            <div className="rounded-xl border border-[#2d4a3e]/20 bg-[#2d4a3e]/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#2d4a3e]">✦ Branded Email Generator</span>
              </div>
              <textarea
                value={brandedGist}
                onChange={e => setBrandedGist(e.target.value)}
                placeholder="Describe what you want to communicate — e.g. 'Checking in with active referral partners about our Q3 availability and upcoming estate sales events.'"
                className={cn(inputCls, "resize-none")}
                rows={3}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">CTA link (optional)</label>
                  <input type="url" value={ctaLink} onChange={e => setCtaLink(e.target.value)} className={inputCls} placeholder="https://..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">CTA label</label>
                  <input type="text" value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} className={inputCls} placeholder="e.g. Book a call" />
                </div>
              </div>
              {brandedError && <p className="text-xs text-red-600">{brandedError}</p>}
              <button
                type="button"
                onClick={async () => {
                  if (!brandedGist.trim()) return;
                  setGeneratingBranded(true); setBrandedError("");
                  try {
                    const res = await fetch("/api/outreach/ai-branded-email", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ gist: brandedGist, ctaLink, ctaLabel, senderName }),
                    });
                    const data = await res.json();
                    if (!res.ok) { setBrandedError(data.error ?? "Generation failed"); return; }
                    setSubject(data.subject ?? "");
                    setBrandedHtml(data.html ?? "");
                  } catch { setBrandedError("Something went wrong. Try again."); }
                  finally { setGeneratingBranded(false); }
                }}
                disabled={generatingBranded || !brandedGist.trim()}
                className="rounded-lg bg-[#2d4a3e] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e3329] disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {generatingBranded ? (<><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Generating…</>) : "Generate Branded Email"}
              </button>
              {brandedHtml && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600">Preview</span>
                    <span className="text-xs text-gray-400">Merge tags will be filled at send time</span>
                  </div>
                  <div className="rounded-lg border border-gray-200 overflow-hidden" style={{ height: 320 }}>
                    <iframe
                      srcDoc={brandedHtml}
                      className="w-full h-full border-0"
                      sandbox="allow-same-origin allow-popups allow-top-navigation-by-user-activation"
                      title="Branded email preview"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Subject (editable)</label>
                    <input type="text" value={subject} onChange={e => setSubject(e.target.value)} className={inputCls} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CTA link for text emails */}
          {emailType === "text" && channel === "Email" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">CTA link (optional)</label>
                <input type="url" value={ctaLink} onChange={e => setCtaLink(e.target.value)} className={inputCls} placeholder="https://..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">CTA label</label>
                <input type="text" value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} className={inputCls} placeholder="e.g. Book a call" />
              </div>
            </div>
          )}

          {/* Attachment — both modes, Email only */}
          {channel === "Email" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Attachment</label>
              <AttachmentUpload url={attachmentUrl} name={attachmentName} onChange={(u, n) => { setAttachmentUrl(u); setAttachmentName(n); }} />
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-gray-700">
              ← Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={
                emailType === "branded"
                  ? !brandedHtml || !subject.trim()
                  : !bodyText.trim() || (channel === "Email" && !subject.trim())
              }
              className="rounded-lg bg-forest-600 px-5 py-2 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50 transition-colors"
            >
              Next: Review →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Review & Send ── */}
      {step === 3 && (
        <div className="space-y-5">
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 font-medium">
              {error}
            </div>
          )}

          {channel === "Email" && !hasSendScope && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Gmail reconnection required before sending.{" "}
              <a href="/api/crm/gmail/auth" className="font-medium underline">Reconnect Gmail →</a>
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Broadcast name</span>
              <span className="font-medium text-gray-900">{broadcastName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Audience</span>
              <span className="font-medium text-gray-900 text-right max-w-xs">
                {audienceMode === "manual"
                  ? `${selectedContactIds.size} hand-picked contact${selectedContactIds.size !== 1 ? "s" : ""}`
                  : <>
                    {filter.contactType === "ReferralContacts" ? "Referral Partners" : "Clients"}
                    {filter.stages.length ? ` · ${filter.stages.join(", ")}` : ""}
                    {filter.companyIds.length ? ` · ${filter.companyIds.length} co.` : ""}
                    {filter.ownerClerkId ? ` · ${salesStaff.find(s => s.clerkUserId === filter.ownerClerkId)?.displayName ?? ""}` : ""}
                    {filter.tags ? ` · tag: ${filter.tags}` : ""}
                  </>
                }
              </span>
            </div>
            {preview && audienceMode === "filter" && (
              <div className="flex justify-between">
                <span className="text-gray-500">Estimated recipients</span>
                <span className={cn("font-semibold", preview.count === 0 ? "text-red-600" : "text-forest-700")}>
                  {preview.count} contact{preview.count === 1 ? "" : "s"}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Channel</span>
              <span className="font-medium text-gray-900">{channel}</span>
            </div>
            {channel === "Email" && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-500">Sending from</span>
                  <span className="font-medium text-gray-900">{gmailEmail ?? "Your Gmail"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Subject</span>
                  <span className="font-medium text-gray-900 max-w-xs truncate text-right">{subject}</span>
                </div>
              </>
            )}
          </div>

          {/* Message preview */}
          {emailType === "branded" && brandedHtml ? (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Branded email preview</p>
              <div className="rounded-lg border border-gray-200 overflow-hidden" style={{ height: 280 }}>
                <iframe srcDoc={brandedHtml} className="w-full h-full border-0" sandbox="allow-same-origin allow-popups allow-top-navigation-by-user-activation" title="Preview" />
              </div>
            </div>
          ) : bodyText ? (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Message preview</p>
              <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {bodyText}
              </div>
            </div>
          ) : null}

          {attachmentName && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Attachment</span>
              <span className="font-medium text-gray-900">{attachmentName}</span>
            </div>
          )}

          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            You will receive a confirmation email at <strong>{gmailEmail ?? "your address"}</strong> once all messages finish sending.
          </div>

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(2)} className="text-sm text-gray-500 hover:text-gray-700">
              ← Back
            </button>
            <button
              onClick={handleSend}
              disabled={sending || (channel === "Email" && !hasSendScope)}
              className="rounded-lg bg-forest-600 px-6 py-2 text-sm font-semibold text-white hover:bg-forest-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {sending ? (
                <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Sending…</>
              ) : audienceMode === "manual"
                ? `Send to ${selectedContactIds.size} contact${selectedContactIds.size !== 1 ? "s" : ""}`
                : `Send to ${preview?.count ?? "…"} contacts`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main BroadcastsTab export ────────────────────────────────────────────────
export default function BroadcastsTab({
  templates, companies, staffMembers, currentUserId,
  hasSendScope, gmailEmail,
}: {
  templates: OutreachTemplate[];
  companies: ReferralCompany[];
  staffMembers: StaffMember[];
  currentUserId: string;
  hasSendScope: boolean;
  gmailEmail?: string;
}) {
  const [view, setView] = useState<"list" | "compose">("list");
  const [broadcasts, setBroadcasts] = useState<BroadcastSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/outreach/broadcasts")
      .then(r => r.json())
      .then(data => {
        const parsed: BroadcastSummary[] = (data.broadcasts ?? []).map((s: OutreachSequence) => {
          let cfg: Record<string, unknown> = {};
          try { cfg = JSON.parse(s.triggerConfigJson || "{}"); } catch {}
          return {
            id: s.id,
            name: s.name,
            recipientCount: Number(cfg.recipientCount ?? 0),
            sentAt: String(cfg.sentAt ?? s.createdAt ?? ""),
            channel: (cfg.channel as "Email" | "SMS") ?? "Email",
            sentCount: cfg.sentCount !== undefined ? Number(cfg.sentCount) : undefined,
            failedCount: cfg.failedCount !== undefined ? Number(cfg.failedCount) : undefined,
            status: (s.status === "Archived" ? "Archived" : "Active") as "Active" | "Archived",
          };
        });
        setBroadcasts(parsed.sort((a, b) => b.sentAt.localeCompare(a.sentAt)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleDone(broadcast: BroadcastSummary) {
    setBroadcasts(prev => [broadcast, ...prev]);
  }

  if (view === "compose") {
    return (
      <ComposeWizard
        templates={templates}
        companies={companies}
        staffMembers={staffMembers}
        currentUserId={currentUserId}
        hasSendScope={hasSendScope}
        gmailEmail={gmailEmail}
        onDone={handleDone}
        onCancel={() => setView("list")}
      />
    );
  }

  return (
    <BroadcastsList
      broadcasts={broadcasts}
      loading={loading}
      onNew={() => setView("compose")}
    />
  );
}
