"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { OutreachTemplate, OutreachSequence, OutreachContactType } from "@/lib/types";
import type { ReferralCompany, StaffMember } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────
interface BroadcastSummary {
  id: string;
  name: string;
  recipientCount: number;
  sentAt: string;
  channel: "Email" | "SMS";
  sentCount?: number;
  failedCount?: number;
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

// ─── Broadcasts list ──────────────────────────────────────────────────────────
type BcastSortCol = "name" | "channel" | "recipients" | "delivered" | "failed" | "sent";

function BroadcastsList({ broadcasts, loading, onNew }: {
  broadcasts: BroadcastSummary[];
  loading: boolean;
  onNew: () => void;
}) {
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<"All" | "Email" | "SMS">("All");
  const [statusFilter, setStatusFilter] = useState<"all" | "ok" | "failures">("all");
  const [sort, setSort] = useState<{ col: BcastSortCol; dir: "asc" | "desc" }>({ col: "sent", dir: "desc" });

  function toggleSort(col: BcastSortCol) {
    setSort(s => s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "desc" });
  }

  const filtered = broadcasts.filter(b => {
    if (search && !b.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (channelFilter !== "All" && b.channel !== channelFilter) return false;
    if (statusFilter === "ok" && (b.failedCount ?? 0) > 0) return false;
    if (statusFilter === "failures" && (b.failedCount ?? 0) === 0) return false;
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
      <div className="mb-3 flex flex-wrap gap-2">
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
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as "all" | "ok" | "failures")}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
        >
          <option value="all">All statuses</option>
          <option value="ok">Fully delivered</option>
          <option value="failures">Has failures</option>
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
      ) : broadcasts.length === 0 ? (
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {sorted.map(b => {
                const hasFailed = (b.failedCount ?? 0) > 0;
                const hasTracking = b.sentCount !== undefined;
                return (
                  <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">{b.name}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        b.channel === "Email" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                      )}>
                        {b.channel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{b.recipientCount.toLocaleString()}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {hasTracking
                        ? <span className="font-medium text-green-700">{b.sentCount!.toLocaleString()}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {hasTracking
                        ? hasFailed
                          ? <span className="font-medium text-red-600">{b.failedCount!.toLocaleString()}</span>
                          : <span className="text-gray-400">0</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-500">{timeAgo(b.sentAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
            {sorted.length} of {broadcasts.length} broadcast{broadcasts.length !== 1 ? "s" : ""}
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
    setBodyText(t.body);
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
    if (!broadcastName.trim() || !bodyText.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/outreach/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: broadcastName,
          filter: buildApiFilter(),
          subject,
          bodyHtml: bodyText.replace(/\n/g, "<br>"),
          templateId: selectedTemplateId || undefined,
          channel,
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
                    onChange={() => { setChannel(ch); setSelectedTemplateId(""); }}
                    className="accent-forest-600"
                  />
                  <span className="text-sm text-gray-700">
                    {ch === "Email" ? "Email (via Gmail)" : "SMS — manual task created"}
                  </span>
                </label>
              ))}
            </div>
          </div>

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

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-gray-700">
              ← Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!bodyText.trim() || (channel === "Email" && !subject.trim())}
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
          {bodyText && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Message preview</p>
              <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {bodyText}
              </div>
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
