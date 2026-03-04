"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ClientOpportunity, ClientContact, ReferralCompany, OpportunityStage, CRMActivityType, KeyPerson, CRMActivity, ReferralContact } from "@/lib/types";

type Tab = "opportunities" | "contacts" | "referrals" | "settings";

interface CRMClientProps {
  opportunities: ClientOpportunity[];
  clientContacts: ClientContact[];
  companies: ReferralCompany[];
  gmailConnected: boolean;
  gmailEmail?: string;
}

const STAGES: OpportunityStage[] = ["Lead", "Qualifying", "Proposal Sent", "Won", "Lost"];

const STAGE_COLORS: Record<OpportunityStage, string> = {
  Lead: "bg-blue-100 text-blue-700",
  Qualifying: "bg-yellow-100 text-yellow-700",
  "Proposal Sent": "bg-purple-100 text-purple-700",
  Won: "bg-green-100 text-green-700",
  Lost: "bg-gray-100 text-gray-600",
};

// ─── Opportunities Tab ────────────────────────────────────────────────────────
function OpportunitiesTab({
  initialOpportunities,
  clientContacts,
  gmailConnected,
}: {
  initialOpportunities: ClientOpportunity[];
  clientContacts: ClientContact[];
  gmailConnected: boolean;
}) {
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [stageFilter, setStageFilter] = useState<OpportunityStage | "All">("All");
  const [sort, setSort] = useState<"newest" | "value" | "nextstep">("newest");
  const [panelOpp, setPanelOpp] = useState<ClientOpportunity | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const filtered = opportunities.filter((o) => stageFilter === "All" || o.stage === stageFilter);

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "value") return b.estimatedValue - a.estimatedValue;
    if (sort === "nextstep") {
      const aDate = a.nextStepDate || "9999";
      const bDate = b.nextStepDate || "9999";
      return aDate.localeCompare(bDate);
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  function getContactName(id: string) {
    return clientContacts.find((c) => c.id === id)?.name || id;
  }

  function exportCsv() {
    const rows = [
      ["Client", "Stage", "Est. Value", "Next Step Date", "Assigned To", "Created At"],
      ...sorted.map((o) => [
        getContactName(o.clientContactId),
        o.stage,
        String(o.estimatedValue),
        o.nextStepDate || "",
        o.assignedToClerkId,
        o.createdAt,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "crm-opportunities.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function openNew() {
    setPanelOpp(null);
    setPanelOpen(true);
  }

  function openEdit(opp: ClientOpportunity) {
    setPanelOpp(opp);
    setPanelOpen(true);
  }

  function handleSaved(opp: ClientOpportunity) {
    setOpportunities((prev) => {
      const idx = prev.findIndex((o) => o.id === opp.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = opp;
        return next;
      }
      return [opp, ...prev];
    });
    setPanelOpen(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this opportunity?")) return;
    await fetch(`/api/crm/opportunities?id=${id}`, { method: "DELETE" });
    setOpportunities((prev) => prev.filter((o) => o.id !== id));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          {(["All", ...STAGES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStageFilter(s)}
              className={cn(
                "px-3 py-1 rounded-full text-sm font-medium border transition-colors",
                stageFilter === s
                  ? "bg-forest-600 text-white border-forest-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-forest-400"
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1"
          >
            <option value="newest">Newest</option>
            <option value="value">Est. Value (desc)</option>
            <option value="nextstep">Next Step (asc)</option>
          </select>
          <button onClick={exportCsv} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">
            Export CSV
          </button>
          <button onClick={openNew} className="text-sm bg-forest-600 text-white rounded-lg px-3 py-1.5 hover:bg-forest-700">
            + New Opportunity
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Stage</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Est. Value</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Next Step</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-10 text-gray-400">
                  No opportunities found
                </td>
              </tr>
            )}
            {sorted.map((opp) => (
              <tr key={opp.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => openEdit(opp)}>
                <td className="px-4 py-3 font-medium text-gray-900">{getContactName(opp.clientContactId)}</td>
                <td className="px-4 py-3">
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STAGE_COLORS[opp.stage])}>
                    {opp.stage}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {opp.estimatedValue ? `$${opp.estimatedValue.toLocaleString()}` : "—"}
                </td>
                <td className="px-4 py-3 text-gray-600">{opp.nextStepDate || "—"}</td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleDelete(opp.id)}
                    className="text-red-500 hover:text-red-700 text-xs px-2 py-1"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {panelOpen && (
        <OpportunityPanel
          opportunity={panelOpp}
          clientContacts={clientContacts}
          gmailConnected={gmailConnected}
          onSaved={handleSaved}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Opportunity Panel ────────────────────────────────────────────────────────
function OpportunityPanel({
  opportunity,
  clientContacts,
  gmailConnected,
  onSaved,
  onClose,
}: {
  opportunity: ClientOpportunity | null;
  clientContacts: ClientContact[];
  gmailConnected: boolean;
  onSaved: (opp: ClientOpportunity) => void;
  onClose: () => void;
}) {
  const [clientContactId, setClientContactId] = useState(opportunity?.clientContactId || "");
  const [stage, setStage] = useState<OpportunityStage>(opportunity?.stage || "Lead");
  const [estimatedValue, setEstimatedValue] = useState(String(opportunity?.estimatedValue || ""));
  const [notes, setNotes] = useState(opportunity?.notes || "");
  const [nextStepDate, setNextStepDate] = useState(opportunity?.nextStepDate || "");
  const [nextStepNote, setNextStepNote] = useState(opportunity?.nextStepNote || "");
  const [lostReason, setLostReason] = useState(opportunity?.lostReason || "");
  const [keyPeople, setKeyPeople] = useState<KeyPerson[]>(opportunity?.keyPeople || []);
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonRelationship, setNewPersonRelationship] = useState("");
  const [activities, setActivities] = useState<CRMActivity[]>([]);
  const [activityType, setActivityType] = useState<CRMActivityType>("Note");
  const [activityNote, setActivityNote] = useState("");
  const [activityDate, setActivityDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [syncingGmail, setSyncingGmail] = useState(false);

  const loadActivities = useCallback(async () => {
    if (!opportunity) return;
    const res = await fetch(`/api/crm/activities?opportunityId=${opportunity.id}`);
    if (res.ok) {
      const data = await res.json();
      setActivities(data.activities);
    }
  }, [opportunity]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  async function handleSave() {
    if (!clientContactId) return;
    setSaving(true);
    try {
      const payload = {
        clientContactId,
        stage,
        estimatedValue: parseFloat(estimatedValue) || 0,
        notes,
        nextStepDate,
        nextStepNote,
        lostReason: stage === "Lost" ? lostReason : "",
        keyPeople,
        wonAt: stage === "Won" && !opportunity?.wonAt ? new Date().toISOString() : opportunity?.wonAt,
        lostAt: stage === "Lost" && !opportunity?.lostAt ? new Date().toISOString() : opportunity?.lostAt,
      };
      if (opportunity) {
        const res = await fetch("/api/crm/opportunities", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: opportunity.id, ...payload }),
        });
        const data = await res.json();
        onSaved(data.opportunity);
      } else {
        const res = await fetch("/api/crm/opportunities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        onSaved(data.opportunity);
      }
    } finally {
      setSaving(false);
    }
  }

  function addKeyPerson() {
    if (!newPersonName) return;
    setKeyPeople((prev) => [...prev, { name: newPersonName, relationship: newPersonRelationship }]);
    setNewPersonName("");
    setNewPersonRelationship("");
  }

  async function logActivity() {
    if (!opportunity || !activityNote) return;
    const res = await fetch("/api/crm/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opportunityId: opportunity.id,
        type: activityType,
        note: activityNote,
        activityDate: new Date(activityDate).toISOString(),
      }),
    });
    if (res.ok) {
      setActivityNote("");
      await loadActivities();
    }
  }

  async function syncGmail() {
    if (!opportunity) return;
    const contact = clientContacts.find((c) => c.id === clientContactId);
    if (!contact?.email) {
      alert("Client contact has no email address");
      return;
    }
    setSyncingGmail(true);
    try {
      const res = await fetch("/api/crm/gmail/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId: opportunity.id, query: `from:${contact.email} OR to:${contact.email}` }),
      });
      const data = await res.json();
      alert(`Imported ${data.imported} email(s)`);
      await loadActivities();
    } finally {
      setSyncingGmail(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl h-full bg-white shadow-2xl overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {opportunity ? "Edit Opportunity" : "New Opportunity"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5 flex-1">
          {/* Client Contact */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client Contact</label>
            <select
              value={clientContactId}
              onChange={(e) => setClientContactId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">— Select contact —</option>
              {clientContacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Stage */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
            <div className="flex flex-wrap gap-2">
              {STAGES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStage(s)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                    stage === s ? STAGE_COLORS[s] + " border-transparent" : "bg-white text-gray-500 border-gray-300"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Est. Value */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Value ($)</label>
            <input
              type="number"
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              placeholder="0"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Key People */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Key People</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {keyPeople.map((p, i) => (
                <span key={i} className="flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">
                  {p.name} · {p.relationship}
                  <button onClick={() => setKeyPeople((prev) => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 ml-1">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newPersonName}
                onChange={(e) => setNewPersonName(e.target.value)}
                placeholder="Name"
                className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              />
              <input
                value={newPersonRelationship}
                onChange={(e) => setNewPersonRelationship(e.target.value)}
                placeholder="Relationship"
                className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              />
              <button onClick={addKeyPerson} className="text-sm bg-gray-100 hover:bg-gray-200 rounded-lg px-2 py-1.5">
                Add
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Next Step */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Next Step Date</label>
              <input
                type="date"
                value={nextStepDate}
                onChange={(e) => setNextStepDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Next Step Note</label>
              <input
                type="text"
                value={nextStepNote}
                onChange={(e) => setNextStepNote(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Lost Reason */}
          {stage === "Lost" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lost Reason</label>
              <input
                type="text"
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !clientContactId}
            className="w-full bg-forest-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-forest-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : opportunity ? "Update Opportunity" : "Create Opportunity"}
          </button>

          {/* Activities */}
          {opportunity && (
            <div className="border-t border-gray-200 pt-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-gray-900 text-sm">Activities</h3>
                {gmailConnected && (
                  <button
                    onClick={syncGmail}
                    disabled={syncingGmail}
                    className="text-xs border border-gray-300 rounded-lg px-2 py-1 hover:bg-gray-50 flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                    </svg>
                    {syncingGmail ? "Syncing…" : "Sync Gmail"}
                  </button>
                )}
              </div>

              {/* Log Activity */}
              <div className="flex gap-2 mb-4">
                <select
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value as CRMActivityType)}
                  className="text-sm border border-gray-300 rounded-lg px-2 py-1.5"
                >
                  {(["Call", "Email", "Meeting", "Note", "Task"] as CRMActivityType[]).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={activityDate}
                  onChange={(e) => setActivityDate(e.target.value)}
                  className="text-sm border border-gray-300 rounded-lg px-2 py-1.5"
                />
                <input
                  value={activityNote}
                  onChange={(e) => setActivityNote(e.target.value)}
                  placeholder="Note…"
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-2 py-1.5"
                />
                <button onClick={logActivity} className="text-sm bg-gray-100 hover:bg-gray-200 rounded-lg px-2 py-1.5">
                  Log
                </button>
              </div>

              {/* Timeline */}
              <div className="space-y-2">
                {activities.length === 0 && (
                  <p className="text-xs text-gray-400">No activities yet</p>
                )}
                {activities.map((a) => (
                  <div key={a.id} className="flex gap-3 text-sm">
                    <div className="flex-shrink-0 mt-0.5">
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-xs font-medium",
                        a.type === "Email" ? "bg-blue-100 text-blue-700" :
                        a.type === "Call" ? "bg-green-100 text-green-700" :
                        a.type === "Meeting" ? "bg-purple-100 text-purple-700" :
                        a.type === "Task" ? "bg-orange-100 text-orange-700" :
                        "bg-gray-100 text-gray-600"
                      )}>
                        {a.type}
                        {a.isGmailImported && " ✉"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-700 text-xs whitespace-pre-wrap">{a.note}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{a.activityDate ? new Date(a.activityDate).toLocaleDateString() : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Contacts Tab ─────────────────────────────────────────────────────────────
function ContactsTab({ initialContacts }: { initialContacts: ClientContact[] }) {
  const [contacts, setContacts] = useState(initialContacts);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClientContact | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", source: "", notes: "" });
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditing(null);
    setForm({ name: "", email: "", phone: "", source: "", notes: "" });
    setModalOpen(true);
  }

  function openEdit(c: ClientContact) {
    setEditing(c);
    setForm({ name: c.name, email: c.email, phone: c.phone, source: c.source, notes: c.notes });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name) return;
    setSaving(true);
    try {
      if (editing) {
        const res = await fetch("/api/crm/client-contacts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editing.id, ...form }),
        });
        const data = await res.json();
        setContacts((prev) => prev.map((c) => (c.id === editing.id ? data.contact : c)));
      } else {
        const res = await fetch("/api/crm/client-contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        setContacts((prev) => [data.contact, ...prev]);
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this contact?")) return;
    await fetch(`/api/crm/client-contacts?id=${id}`, { method: "DELETE" });
    setContacts((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={openNew} className="text-sm bg-forest-600 text-white rounded-lg px-3 py-1.5 hover:bg-forest-700">
          + Add Contact
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Source</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 && (
              <tr><td colSpan={5} className="text-center py-10 text-gray-400">No contacts yet</td></tr>
            )}
            {contacts.map((c) => (
              <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-4 py-3 text-gray-600">{c.email || "—"}</td>
                <td className="px-4 py-3 text-gray-600">{c.phone || "—"}</td>
                <td className="px-4 py-3 text-gray-600">{c.source || "—"}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => openEdit(c)} className="text-forest-600 hover:text-forest-800 text-xs px-2 py-1">Edit</button>
                  <button onClick={() => handleDelete(c.id)} className="text-red-500 hover:text-red-700 text-xs px-2 py-1">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">{editing ? "Edit Contact" : "Add Contact"}</h3>
            {(["name", "email", "phone", "source", "notes"] as const).map((field) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">{field}{field === "name" && " *"}</label>
                {field === "notes" ? (
                  <textarea value={form[field]} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                ) : (
                  <input type="text" value={form[field]} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                )}
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModalOpen(false)} className="text-sm border border-gray-300 rounded-lg px-4 py-2">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name} className="text-sm bg-forest-600 text-white rounded-lg px-4 py-2 hover:bg-forest-700 disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Referral Partners Tab ────────────────────────────────────────────────────
function ReferralPartnersTab({ initialCompanies }: { initialCompanies: ReferralCompany[] }) {
  const [companies, setCompanies] = useState(initialCompanies);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Record<string, ReferralContact[]>>({});
  const [companyModal, setCompanyModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<ReferralCompany | null>(null);
  const [companyForm, setCompanyForm] = useState({ name: "", type: "", notes: "" });
  const [contactModal, setContactModal] = useState<string | null>(null);
  const [editingContact, setEditingContact] = useState<ReferralContact | null>(null);
  const [contactForm, setContactForm] = useState({ name: "", title: "", email: "", phone: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const COMPANY_TYPES = ["Senior Living", "Realtor", "Broker", "Doctor", "Attorney", "Hospital", "Financial Advisor", "Other"];

  async function loadContacts(companyId: string) {
    if (contacts[companyId]) return;
    const res = await fetch(`/api/crm/contacts?companyId=${companyId}`);
    if (res.ok) {
      const data = await res.json();
      setContacts((prev) => ({ ...prev, [companyId]: data.contacts }));
    }
  }

  function toggleExpand(id: string) {
    if (expanded === id) {
      setExpanded(null);
    } else {
      setExpanded(id);
      loadContacts(id);
    }
  }

  function openNewCompany() {
    setEditingCompany(null);
    setCompanyForm({ name: "", type: "", notes: "" });
    setCompanyModal(true);
  }

  function openEditCompany(c: ReferralCompany) {
    setEditingCompany(c);
    setCompanyForm({ name: c.name, type: c.type, notes: c.notes });
    setCompanyModal(true);
  }

  async function saveCompany() {
    if (!companyForm.name) return;
    setSaving(true);
    try {
      if (editingCompany) {
        const res = await fetch("/api/crm/companies", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingCompany.id, ...companyForm }),
        });
        const data = await res.json();
        setCompanies((prev) => prev.map((c) => (c.id === editingCompany.id ? data.company : c)));
      } else {
        const res = await fetch("/api/crm/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(companyForm),
        });
        const data = await res.json();
        setCompanies((prev) => [...prev, data.company]);
      }
      setCompanyModal(false);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCompany(id: string) {
    if (!confirm("Delete this company?")) return;
    await fetch(`/api/crm/companies?id=${id}`, { method: "DELETE" });
    setCompanies((prev) => prev.filter((c) => c.id !== id));
  }

  function openAddContact(companyId: string) {
    setEditingContact(null);
    setContactForm({ name: "", title: "", email: "", phone: "", notes: "" });
    setContactModal(companyId);
  }

  function openEditContact(contact: ReferralContact) {
    setEditingContact(contact);
    setContactForm({ name: contact.name, title: contact.title, email: contact.email, phone: contact.phone, notes: contact.notes });
    setContactModal(contact.referralCompanyId);
  }

  async function saveContact() {
    if (!contactModal || !contactForm.name) return;
    setSaving(true);
    try {
      if (editingContact) {
        const res = await fetch("/api/crm/contacts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingContact.id, ...contactForm }),
        });
        const data = await res.json();
        setContacts((prev) => ({
          ...prev,
          [contactModal]: (prev[contactModal] || []).map((c) => (c.id === editingContact.id ? data.contact : c)),
        }));
      } else {
        const res = await fetch("/api/crm/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...contactForm, referralCompanyId: contactModal }),
        });
        const data = await res.json();
        setContacts((prev) => ({
          ...prev,
          [contactModal]: [...(prev[contactModal] || []), data.contact],
        }));
      }
      setContactModal(null);
    } finally {
      setSaving(false);
    }
  }

  async function deleteContact(companyId: string, contactId: string) {
    if (!confirm("Delete this contact?")) return;
    await fetch(`/api/crm/contacts?id=${contactId}`, { method: "DELETE" });
    setContacts((prev) => ({
      ...prev,
      [companyId]: (prev[companyId] || []).filter((c) => c.id !== contactId),
    }));
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={openNewCompany} className="text-sm bg-forest-600 text-white rounded-lg px-3 py-1.5 hover:bg-forest-700">
          + Add Company
        </button>
      </div>

      <div className="space-y-3">
        {companies.length === 0 && (
          <p className="text-center text-gray-400 py-10">No referral companies yet</p>
        )}
        {companies.map((company) => (
          <div key={company.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
              onClick={() => toggleExpand(company.id)}
            >
              <div className="flex items-center gap-3">
                <span className="text-gray-400 text-sm">{expanded === company.id ? "▾" : "▸"}</span>
                <div>
                  <span className="font-medium text-gray-900">{company.name}</span>
                  {company.type && (
                    <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{company.type}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => openEditCompany(company)} className="text-xs text-forest-600 hover:text-forest-800 px-2 py-1">Edit</button>
                <button onClick={() => deleteCompany(company.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1">Delete</button>
              </div>
            </div>

            {expanded === company.id && (
              <div className="border-t border-gray-100 px-4 py-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contacts</span>
                  <button onClick={() => openAddContact(company.id)} className="text-xs text-forest-600 hover:text-forest-800">+ Add Contact</button>
                </div>
                {(contacts[company.id] || []).length === 0 ? (
                  <p className="text-xs text-gray-400">No contacts</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500">
                        <th className="pb-1 font-medium">Name</th>
                        <th className="pb-1 font-medium">Title</th>
                        <th className="pb-1 font-medium">Email</th>
                        <th className="pb-1 font-medium">Phone</th>
                        <th className="pb-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(contacts[company.id] || []).map((c) => (
                        <tr key={c.id} className="border-t border-gray-100">
                          <td className="py-1.5 font-medium text-gray-800">{c.name}</td>
                          <td className="py-1.5 text-gray-600">{c.title || "—"}</td>
                          <td className="py-1.5 text-gray-600">{c.email || "—"}</td>
                          <td className="py-1.5 text-gray-600">{c.phone || "—"}</td>
                          <td className="py-1.5 text-right space-x-2">
                            <button onClick={() => openEditContact(c)} className="text-xs text-forest-600 hover:text-forest-800">Edit</button>
                            <button onClick={() => deleteContact(company.id, c.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Company Modal */}
      {companyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCompanyModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">{editingCompany ? "Edit Company" : "Add Company"}</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input type="text" value={companyForm.name} onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={companyForm.type} onChange={(e) => setCompanyForm((f) => ({ ...f, type: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">— Select type —</option>
                {COMPANY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={companyForm.notes} onChange={(e) => setCompanyForm((f) => ({ ...f, notes: e.target.value }))} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setCompanyModal(false)} className="text-sm border border-gray-300 rounded-lg px-4 py-2">Cancel</button>
              <button onClick={saveCompany} disabled={saving || !companyForm.name} className="text-sm bg-forest-600 text-white rounded-lg px-4 py-2 hover:bg-forest-700 disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contact Modal */}
      {contactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setContactModal(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">{editingContact ? "Edit Contact" : "Add Contact"}</h3>
            {(["name", "title", "email", "phone", "notes"] as const).map((field) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">{field}{field === "name" && " *"}</label>
                {field === "notes" ? (
                  <textarea value={contactForm[field]} onChange={(e) => setContactForm((f) => ({ ...f, [field]: e.target.value }))} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                ) : (
                  <input type="text" value={contactForm[field]} onChange={(e) => setContactForm((f) => ({ ...f, [field]: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                )}
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setContactModal(null)} className="text-sm border border-gray-300 rounded-lg px-4 py-2">Cancel</button>
              <button onClick={saveContact} disabled={saving || !contactForm.name} className="text-sm bg-forest-600 text-white rounded-lg px-4 py-2 hover:bg-forest-700 disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Gmail Settings Tab ───────────────────────────────────────────────────────
function GmailSettingsTab({ gmailConnected, gmailEmail }: { gmailConnected: boolean; gmailEmail?: string }) {
  const [connected, setConnected] = useState(gmailConnected);
  const [email, setEmail] = useState(gmailEmail);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    if (!confirm("Disconnect Gmail?")) return;
    setDisconnecting(true);
    try {
      await fetch("/api/crm/gmail/tokens", { method: "DELETE" });
      setConnected(false);
      setEmail(undefined);
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Gmail Integration</h3>
      <p className="text-sm text-gray-600 mb-6">
        Connect your Gmail account to automatically capture email threads as CRM activities on any opportunity.
      </p>

      {connected ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-green-800">Connected</p>
              {email && <p className="text-xs text-green-700">{email}</p>}
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="text-sm text-red-600 hover:text-red-800 border border-red-200 rounded-lg px-3 py-1.5"
          >
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
          <div className="w-12 h-12 bg-white border border-gray-200 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
            </svg>
          </div>
          <p className="text-sm text-gray-600 mb-4">Connect Gmail to auto-capture email threads as CRM activities</p>
          <a
            href="/api/crm/gmail/auth"
            className="inline-block bg-forest-600 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-forest-700"
          >
            Connect Gmail
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Main CRMClient ───────────────────────────────────────────────────────────
export function CRMClient({ opportunities, clientContacts, companies, gmailConnected, gmailEmail }: CRMClientProps) {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab | null) || "opportunities";
  const [tab, setTab] = useState<Tab>(initialTab);

  const tabs: { key: Tab; label: string }[] = [
    { key: "opportunities", label: "Opportunities" },
    { key: "contacts", label: "Contacts" },
    { key: "referrals", label: "Referral Partners" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">CRM</h1>
        <p className="text-sm text-gray-500">Manage referral partners, client contacts, and opportunities</p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-0">
          {tabs.map((t) => (
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

      {tab === "opportunities" && (
        <OpportunitiesTab
          initialOpportunities={opportunities}
          clientContacts={clientContacts}
          gmailConnected={gmailConnected}
        />
      )}
      {tab === "contacts" && <ContactsTab initialContacts={clientContacts} />}
      {tab === "referrals" && <ReferralPartnersTab initialCompanies={companies} />}
      {tab === "settings" && <GmailSettingsTab gmailConnected={gmailConnected} gmailEmail={gmailEmail} />}
    </div>
  );
}
