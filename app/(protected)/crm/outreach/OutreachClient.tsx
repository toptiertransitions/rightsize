"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { OutreachTemplate, OutreachTemplateChannel } from "@/lib/types";
import type { ReferralCompany, StaffMember } from "@/lib/types";
import BroadcastsTab from "./BroadcastsTab";

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

// ─── Templates Tab ─────────────────────────────────────────────────────────────
const CHANNEL_PILLS: Record<OutreachTemplateChannel, string> = {
  Email: "bg-blue-100 text-blue-700",
  SMS: "bg-green-100 text-green-700",
};

interface TemplateFormState {
  name: string;
  channel: OutreachTemplateChannel;
  subject: string;
  body: string;
  shared: boolean;
}

const EMPTY_TEMPLATE: TemplateFormState = {
  name: "", channel: "Email", subject: "", body: "", shared: false,
};

function TemplatesTab({
  templates: initialTemplates,
  currentUserId,
}: {
  templates: OutreachTemplate[];
  currentUserId: string;
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateFormState>(EMPTY_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<OutreachTemplateChannel | "All">("All");

  const filtered = templates.filter(t => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase());
    const matchChannel = channelFilter === "All" || t.channel === channelFilter;
    return matchSearch && matchChannel;
  });

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_TEMPLATE);
    setModalOpen(true);
  }

  function openEdit(t: OutreachTemplate) {
    setEditingId(t.id);
    setForm({ name: t.name, channel: t.channel, subject: t.subject, body: t.body, shared: t.shared });
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
                        onChange={() => setForm(f => ({ ...f, channel: ch }))}
                        className="accent-forest-600"
                      />
                      <span className="text-sm text-gray-700">{ch}</span>
                    </label>
                  ))}
                </div>
              </div>

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

// ─── Placeholder tabs ─────────────────────────────────────────────────────────
function ComingSoonTab({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 py-20 text-center">
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className="mt-1 text-sm text-gray-400">{description}</p>
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

      {tab === "myday" && (
        <ComingSoonTab
          title="My Day — coming soon"
          description="Your daily dashboard: replies waiting, tasks due today, and emails sending on your behalf."
        />
      )}
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
        <ComingSoonTab
          title="Sequences — coming soon"
          description="Multi-step, multi-day cadences that auto-pause on reply."
        />
      )}
      {tab === "templates" && (
        <TemplatesTab templates={initialTemplates} currentUserId={currentUserId} />
      )}
    </div>
  );
}
