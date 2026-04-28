"use client";

import { useState, useEffect, useCallback } from "react";
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
}

interface AudienceFilter {
  contactType: OutreachContactType;
  stages: string[];
  tags: string;
  companyId: string;
  assignedToClerkId: string;
  excludeOptout: boolean;
}

const REFERRAL_STAGES = [
  "Identified", "Met", "Agreed to Refer", "Shared Leads",
  "Active Referral", "Inactive Referral",
];

const EMPTY_FILTER: AudienceFilter = {
  contactType: "ReferralContacts",
  stages: [],
  tags: "",
  companyId: "",
  assignedToClerkId: "",
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

// ─── Broadcasts list ──────────────────────────────────────────────────────────
function BroadcastsList({
  broadcasts,
  loading,
  onNew,
}: {
  broadcasts: BroadcastSummary[];
  loading: boolean;
  onNew: () => void;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">One-time sends to a filtered list of contacts.</p>
        <button
          onClick={onNew}
          className="rounded-lg bg-forest-600 px-4 py-2 text-sm font-medium text-white hover:bg-forest-700 transition-colors"
        >
          + New Broadcast
        </button>
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
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Recipients</th>
                <th className="px-4 py-3 hidden sm:table-cell">Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {broadcasts.map(b => (
                <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{b.name}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      b.channel === "Email" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                    )}>
                      {b.channel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{b.recipientCount.toLocaleString()}</td>
                  <td className="px-4 py-3 hidden sm:table-cell text-gray-500">{timeAgo(b.sentAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
  const [preview, setPreview] = useState<{ count: number; sample: string[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Step 2 state
  const [channel, setChannel] = useState<"Email" | "SMS">("Email");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const emailTemplates = templates.filter(t => t.channel === "Email");
  const smsTemplates = templates.filter(t => t.channel === "SMS");
  const relevantTemplates = channel === "Email" ? emailTemplates : smsTemplates;

  function applyTemplate(id: string) {
    setSelectedTemplateId(id);
    const t = templates.find(t => t.id === id);
    if (!t) return;
    setSubject(t.subject);
    setBodyText(t.body);
  }

  const fetchPreview = useCallback(async () => {
    setPreviewing(true);
    setPreview(null);
    try {
      const res = await fetch("/api/outreach/contacts-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactType: filter.contactType,
          stages: filter.stages.length ? filter.stages : undefined,
          tags: filter.tags || undefined,
          companyId: filter.companyId || undefined,
          assignedToClerkId: filter.assignedToClerkId || undefined,
          excludeOptout: filter.excludeOptout,
        }),
      });
      const data = await res.json();
      setPreview(data);
    } finally {
      setPreviewing(false);
    }
  }, [filter]);

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
          filter: {
            contactType: filter.contactType,
            stages: filter.stages.length ? filter.stages : undefined,
            tags: filter.tags || undefined,
            companyId: filter.companyId || undefined,
            assignedToClerkId: filter.assignedToClerkId || undefined,
            excludeOptout: filter.excludeOptout,
          },
          subject,
          bodyHtml: bodyText.replace(/\n/g, "<br>"),
          templateId: selectedTemplateId || undefined,
          channel,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to send broadcast");
        return;
      }
      onDone(data.broadcast);
    } finally {
      setSending(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent";

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
                    onChange={() => setFilter(f => ({ ...f, contactType: ct, stages: [], companyId: "", assignedToClerkId: "" }))}
                    className="accent-forest-600"
                  />
                  <span className="text-sm text-gray-700">
                    {ct === "ReferralContacts" ? "Referral Partners" : "Clients"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Referral-specific filters */}
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
                <select
                  value={filter.companyId}
                  onChange={e => setFilter(f => ({ ...f, companyId: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">All companies</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Client-specific filters */}
          {filter.contactType === "ClientContacts" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Assigned to</label>
              <select
                value={filter.assignedToClerkId}
                onChange={e => setFilter(f => ({ ...f, assignedToClerkId: e.target.value }))}
                className={inputCls}
              >
                <option value="">All reps</option>
                <option value={currentUserId}>Me only</option>
                {staffMembers.filter(s => s.clerkUserId !== currentUserId).map(s => (
                  <option key={s.clerkUserId} value={s.clerkUserId}>{s.displayName}</option>
                ))}
              </select>
            </div>
          )}

          {/* Tags */}
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
                  : `${preview.count} contact${preview.count === 1 ? "" : "s"} — e.g. ${preview.sample.slice(0, 3).join(", ")}`}
              </span>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setStep(2)}
              disabled={!broadcastName.trim()}
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
              rows={10}
              placeholder={channel === "Email"
                ? "Hi {{first_name}},\n\nI wanted to reach out…"
                : "Hi {{first_name}}, just following up from Top Tier…"}
            />
            <p className="mt-1 text-xs text-gray-400">
              Merge tags: {"{{first_name}}"}, {"{{last_name}}"}, {"{{rep_first_name}}"}
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
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Broadcast name</span>
              <span className="font-medium text-gray-900">{broadcastName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Audience</span>
              <span className="font-medium text-gray-900">
                {filter.contactType === "ReferralContacts" ? "Referral Partners" : "Clients"}
                {filter.stages.length ? ` · ${filter.stages.join(", ")}` : ""}
                {filter.tags ? ` · tag: ${filter.tags}` : ""}
              </span>
            </div>
            {preview && (
              <div className="flex justify-between">
                <span className="text-gray-500">Recipients</span>
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

          {channel === "Email" && !hasSendScope && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Gmail reconnection required before sending.{" "}
              <a href="/api/crm/gmail/auth" className="font-medium underline">Reconnect Gmail →</a>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(2)} className="text-sm text-gray-500 hover:text-gray-700">
              ← Back
            </button>
            <button
              onClick={handleSend}
              disabled={sending || (channel === "Email" && !hasSendScope)}
              className="rounded-lg bg-forest-600 px-6 py-2 text-sm font-semibold text-white hover:bg-forest-700 disabled:opacity-50 transition-colors"
            >
              {sending ? "Sending…" : `Send to ${preview?.count ?? "…"} contacts`}
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
          };
        });
        setBroadcasts(parsed.sort((a, b) => b.sentAt.localeCompare(a.sentAt)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleDone(broadcast: BroadcastSummary) {
    setBroadcasts(prev => [broadcast, ...prev]);
    setView("list");
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
