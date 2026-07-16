"use client";

import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import type { OutreachTemplate, OutreachTemplateChannel } from "@/lib/types";
import type { ReferralCompany, StaffMember } from "@/lib/types";
import BroadcastsTab from "./BroadcastsTab";
import MyDayTab from "./MyDayTab";
import SequencesTab from "./SequencesTab";

type OutreachTab = "myday" | "broadcasts" | "sequences" | "templates";

interface OutreachClientProps {
  currentUserId: string;
  gmailConnected: boolean;
  hasSendScope: boolean;
  gmailEmail?: string;
  initialTemplates: OutreachTemplate[];
  companies: ReferralCompany[];
  staffMembers: StaffMember[];
}

// ─── Merge tag reference ──────────────────────────────────────────────────────
const MERGE_TAGS = [
  "{{first_name}}", "{{last_name}}", "{{rep_first_name}}",
  "{{rep_signature}}", "{{company}}", "{{custom.*}}",
];

// ─── Gmail reconnect banner ───────────────────────────────────────────────────
function GmailBanner({ connected, hasSendScope }: { connected: boolean; hasSendScope: boolean }) {
  if (connected && hasSendScope) return null;
  return (
    <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-amber-800">
          {!connected ? "Gmail not connected" : "Gmail reconnection required"}
        </p>
        <p className="mt-0.5 text-sm text-amber-700">
          {!connected
            ? "Connect your Gmail account to send Outreach emails from your inbox."
            : "Your Gmail connection was created before Outreach was enabled. Reconnect to grant send permission."}
        </p>
      </div>
      <a
        href="/api/crm/gmail/auth"
        className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
      >
        {!connected ? "Connect Gmail" : "Reconnect Gmail"}
      </a>
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

// ─── Templates Tab ─────────────────────────────────────────────────────────────
const CHANNEL_PILLS: Record<OutreachTemplateChannel, string> = {
  Email: "bg-blue-100 text-blue-700",
  SMS: "bg-green-100 text-green-700",
};

interface TemplateFormState {
  name: string;
  channel: OutreachTemplateChannel;
  emailType: "text" | "branded";
  subject: string;
  body: string;
  ctaLink: string;
  ctaLabel: string;
  attachmentUrl: string;
  attachmentName: string;
  shared: boolean;
}

const EMPTY_TEMPLATE: TemplateFormState = {
  name: "", channel: "Email", emailType: "text", subject: "", body: "",
  ctaLink: "", ctaLabel: "", attachmentUrl: "", attachmentName: "", shared: false,
};

function TemplatesTab({
  templates: initialTemplates,
  currentUserId,
  staffMembers,
}: {
  templates: OutreachTemplate[];
  currentUserId: string;
  staffMembers: StaffMember[];
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateFormState>(EMPTY_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<OutreachTemplateChannel | "All">("All");
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [brandedGist, setBrandedGist] = useState("");
  const [generatingBranded, setGeneratingBranded] = useState(false);
  const [brandedError, setBrandedError] = useState("");

  const currentUser = staffMembers.find(s => s.clerkUserId === currentUserId);
  const senderName = currentUser?.displayName || "Top Tier Transitions";

  const filtered = templates.filter(t => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase());
    const matchChannel = channelFilter === "All" || t.channel === channelFilter;
    return matchSearch && matchChannel;
  });

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_TEMPLATE);
    setShowAiPrompt(false);
    setBrandedGist("");
    setBrandedError("");
    setModalOpen(true);
  }

  function openEdit(t: OutreachTemplate) {
    setEditingId(t.id);
    setForm({
      name: t.name,
      channel: t.channel,
      emailType: t.emailType ?? "text",
      subject: t.subject,
      body: t.body,
      ctaLink: t.ctaLink ?? "",
      ctaLabel: t.ctaLabel ?? "",
      attachmentUrl: t.attachmentUrl ?? "",
      attachmentName: t.attachmentUrl ? "Attached file" : "",
      shared: t.shared,
    });
    setShowAiPrompt(false);
    setBrandedGist("");
    setBrandedError("");
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        const res = await fetch("/api/outreach/templates", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, ...form }),
        });
        const data = await res.json();
        setTemplates(prev => prev.map(t => t.id === editingId ? data.template : t));
      } else {
        const res = await fetch("/api/outreach/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        setTemplates(prev => [data.template, ...prev]);
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/outreach/templates?id=${id}`, { method: "DELETE" });
    setTemplates(prev => prev.filter(t => t.id !== id));
    setDeleteConfirm(null);
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent";

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-1 min-w-0">
          <input
            type="text"
            placeholder="Search templates…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
          />
          <select
            value={channelFilter}
            onChange={e => setChannelFilter(e.target.value as OutreachTemplateChannel | "All")}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
          >
            <option value="All">All channels</option>
            <option value="Email">Email</option>
            <option value="SMS">SMS</option>
          </select>
        </div>
        <button
          onClick={openCreate}
          className="shrink-0 rounded-lg bg-forest-600 px-4 py-2 text-sm font-medium text-white hover:bg-forest-700 transition-colors"
        >
          + New Template
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center">
          <p className="text-sm text-gray-500">
            {templates.length === 0 ? "No templates yet — create one to get started." : "No templates match your search."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3 hidden md:table-cell">Subject</th>
                <th className="px-4 py-3 hidden sm:table-cell">Shared</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filtered.map(t => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", CHANNEL_PILLS[t.channel])}>
                      {t.channel}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-500 max-w-xs truncate">
                    {t.channel === "Email" ? (t.subject || <span className="text-gray-300 italic">No subject</span>) : "—"}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-gray-500">
                    {t.shared ? (
                      <span className="text-forest-600 font-medium">Shared</span>
                    ) : (
                      <span className="text-gray-400">Private</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(t)}
                        className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(t.id)}
                        className="text-xs text-red-400 hover:text-red-600 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="w-full sm:max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <h2 className="text-base font-semibold text-gray-900">
                {editingId ? "Edit Template" : "New Template"}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={inputCls}
                  placeholder="e.g. Initial outreach email"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Channel</label>
                <div className="flex gap-3">
                  {(["Email", "SMS"] as OutreachTemplateChannel[]).map(ch => (
                    <label key={ch} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="channel"
                        value={ch}
                        checked={form.channel === ch}
                        onChange={() => setForm(f => ({ ...f, channel: ch, emailType: "text" }))}
                        className="accent-forest-600"
                      />
                      <span className="text-sm text-gray-700">{ch}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Email format toggle */}
              {form.channel === "Email" && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Email format</label>
                  <div className="flex gap-1 p-1 rounded-lg bg-gray-100 w-fit">
                    {(["text", "branded"] as const).map(t => (
                      <button key={t} type="button"
                        onClick={() => { setForm(f => ({ ...f, emailType: t })); setBrandedError(""); }}
                        className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                          form.emailType === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                        )}
                      >
                        {t === "text" ? "Text Email" : "✦ Branded Email"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Text email controls */}
              {form.emailType === "text" && (
                <>
                  {/* AI prompt */}
                  {showAiPrompt ? (
                    <AiPromptPanel
                      channel={form.channel}
                      senderName={senderName}
                      onGenerated={(s, b) => { setForm(f => ({ ...f, subject: s, body: b })); }}
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

                  {form.channel === "Email" && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
                      <input
                        type="text"
                        value={form.subject}
                        onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                        className={inputCls}
                        placeholder="e.g. Following up on our conversation"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Body</label>
                    <textarea
                      value={form.body}
                      onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                      className={inputCls}
                      rows={8}
                      placeholder={form.channel === "Email"
                        ? "Hi {{first_name}},\n\nI wanted to reach out…"
                        : "Hi {{first_name}}, just following up…"}
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      Merge tags: {MERGE_TAGS.join(", ")}
                    </p>
                  </div>
                </>
              )}

              {/* Branded email controls */}
              {form.emailType === "branded" && form.channel === "Email" && (
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
                      <input type="url" value={form.ctaLink} onChange={e => setForm(f => ({ ...f, ctaLink: e.target.value }))} className={inputCls} placeholder="https://..." />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">CTA label</label>
                      <input type="text" value={form.ctaLabel} onChange={e => setForm(f => ({ ...f, ctaLabel: e.target.value }))} className={inputCls} placeholder="e.g. Book a call" />
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
                          body: JSON.stringify({ gist: brandedGist, ctaLink: form.ctaLink, ctaLabel: form.ctaLabel, senderName }),
                        });
                        const data = await res.json();
                        if (!res.ok) { setBrandedError(data.error ?? "Generation failed"); return; }
                        setForm(f => ({ ...f, subject: data.subject ?? f.subject, body: data.html ?? f.body }));
                      } catch { setBrandedError("Something went wrong. Try again."); }
                      finally { setGeneratingBranded(false); }
                    }}
                    disabled={generatingBranded || !brandedGist.trim()}
                    className="rounded-lg bg-[#2d4a3e] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e3329] disabled:opacity-50 transition-colors flex items-center gap-2"
                  >
                    {generatingBranded ? (<><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Generating…</>) : "Generate Branded Email"}
                  </button>
                  {form.body && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-600">Preview</span>
                        <span className="text-xs text-gray-400">Merge tags will be filled at send time</span>
                      </div>
                      <div className="rounded-lg border border-gray-200 overflow-hidden" style={{ height: 280 }}>
                        <iframe
                          srcDoc={form.body}
                          className="w-full h-full border-0"
                          sandbox="allow-same-origin allow-popups allow-top-navigation-by-user-activation"
                          title="Branded email preview"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Subject (editable)</label>
                        <input type="text" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} className={inputCls} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* CTA link for text emails */}
              {form.emailType === "text" && form.channel === "Email" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">CTA link (optional)</label>
                    <input type="url" value={form.ctaLink} onChange={e => setForm(f => ({ ...f, ctaLink: e.target.value }))} className={inputCls} placeholder="https://..." />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">CTA label</label>
                    <input type="text" value={form.ctaLabel} onChange={e => setForm(f => ({ ...f, ctaLabel: e.target.value }))} className={inputCls} placeholder="e.g. Book a call" />
                  </div>
                </div>
              )}

              {/* Attachment — Email only */}
              {form.channel === "Email" && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Attachment</label>
                  <AttachmentUpload
                    url={form.attachmentUrl}
                    name={form.attachmentName}
                    onChange={(u, n) => setForm(f => ({ ...f, attachmentUrl: u, attachmentName: n }))}
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="shared"
                  checked={form.shared}
                  onChange={e => setForm(f => ({ ...f, shared: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 accent-forest-600 cursor-pointer"
                />
                <label htmlFor="shared" className="text-sm text-gray-700 cursor-pointer">
                  Share with all reps
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="rounded-lg bg-forest-600 px-4 py-2 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving…" : editingId ? "Save Changes" : "Create Template"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete template?</h3>
            <p className="text-sm text-gray-500 mb-6">
              This can&apos;t be undone. Any sequences using this template will need to be updated.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="text-sm font-medium text-gray-600 hover:text-gray-900">
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main client ──────────────────────────────────────────────────────────────
export default function OutreachClient({
  currentUserId,
  gmailConnected,
  hasSendScope,
  gmailEmail,
  initialTemplates,
  companies,
  staffMembers,
}: OutreachClientProps) {
  const [tab, setTab] = useState<OutreachTab>("myday");

  const tabs: { key: OutreachTab; label: string }[] = [
    { key: "myday", label: "My Day" },
    { key: "broadcasts", label: "Broadcasts" },
    { key: "sequences", label: "Sequences" },
    { key: "templates", label: "Templates" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Outreach</h1>
        <p className="text-sm text-gray-500">
          Sequences, broadcasts, and tasks — all in one place
          {gmailEmail && hasSendScope && (
            <span className="ml-2 text-forest-600">· Sending as {gmailEmail}</span>
          )}
        </p>
      </div>

      <GmailBanner connected={gmailConnected} hasSendScope={hasSendScope} />

      {/* Tab bar */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-0">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                tab === t.key
                  ? "border-forest-600 text-forest-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "myday" && <MyDayTab />}
      {tab === "broadcasts" && (
        <BroadcastsTab
          templates={initialTemplates}
          companies={companies}
          staffMembers={staffMembers}
          currentUserId={currentUserId}
          hasSendScope={hasSendScope}
          gmailEmail={gmailEmail}
        />
      )}
      {tab === "sequences" && (
        <SequencesTab
          companies={companies}
          staffMembers={staffMembers}
          currentUserId={currentUserId}
        />
      )}
      {tab === "templates" && (
        <TemplatesTab
          templates={initialTemplates}
          currentUserId={currentUserId}
          staffMembers={staffMembers}
        />
      )}
    </div>
  );
}
