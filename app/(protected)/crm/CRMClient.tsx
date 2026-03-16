"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ClientOpportunity, ClientContact, ReferralCompany, OpportunityStage, CRMActivityType, KeyPerson, CRMActivity, ReferralContact, ReferralContactStage, StaffMember, ReferralPriority } from "@/lib/types";

// ─── CSV Helpers ─────────────────────────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let inQuote = false;
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ""));
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
    return row;
  }).filter(row => Object.values(row).some(v => v.trim()));
}

type Tab = "dashboard" | "opportunities" | "contacts" | "referrals" | "activity" | "settings";

interface CRMClientProps {
  opportunities: ClientOpportunity[];
  clientContacts: ClientContact[];
  companies: ReferralCompany[];
  referralContacts: ReferralContact[];
  staffMembers: StaffMember[];
  gmailConnected: boolean;
  gmailEmail?: string;
}

const STAGES: OpportunityStage[] = ["Lead", "Qualifying", "Proposing", "Won", "Lost"];

const STAGE_COLORS: Record<OpportunityStage, string> = {
  Lead: "bg-blue-100 text-blue-700",
  Qualifying: "bg-yellow-100 text-yellow-700",
  Proposing: "bg-purple-100 text-purple-700",
  Won: "bg-green-100 text-green-700",
  Lost: "bg-gray-100 text-gray-600",
};

const REFERRAL_STAGES: ReferralContactStage[] = ["Identified", "Met", "Agreed to Refer", "Shared Leads", "Active Referral", "Inactive Referral"];

const REF_STAGE_COLORS: Record<ReferralContactStage, string> = {
  "Identified":       "bg-gray-100 text-gray-600",
  "Met":              "bg-blue-100 text-blue-700",
  "Agreed to Refer":  "bg-purple-100 text-purple-700",
  "Shared Leads":     "bg-amber-100 text-amber-700",
  "Active Referral":  "bg-green-100 text-green-700",
  "Inactive Referral":"bg-red-100 text-red-600",
};

// ─── Activity Edit Modal ──────────────────────────────────────────────────────
function ActivityEditModal({
  activity,
  onSaved,
  onClose,
}: {
  activity: CRMActivity;
  onSaved: (a: CRMActivity) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<CRMActivityType>(activity.type);
  const [note, setNote] = useState(activity.note);
  const [activityDate, setActivityDate] = useState(
    activity.activityDate ? activity.activityDate.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/crm/activities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activity.id, type, note, activityDate: new Date(activityDate).toISOString() }),
      });
      const data = await res.json();
      onSaved(data.activity);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Edit Activity</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CRMActivityType)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {(["Call", "Email", "Meeting", "Note", "Task"] as CRMActivityType[]).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            type="date"
            value={activityDate}
            onChange={(e) => setActivityDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm border border-gray-300 rounded-lg px-4 py-2">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-sm bg-forest-600 text-white rounded-lg px-4 py-2 hover:bg-forest-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Opportunities Tab ────────────────────────────────────────────────────────
function OpportunitiesTab({
  initialOpportunities,
  clientContacts,
  staffMembers,
  gmailConnected,
  pendingContactId,
  clearPending,
}: {
  initialOpportunities: ClientOpportunity[];
  clientContacts: ClientContact[];
  staffMembers: StaffMember[];
  gmailConnected: boolean;
  pendingContactId?: string | null;
  clearPending?: () => void;
}) {
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [stageFilter, setStageFilter] = useState<OpportunityStage | "All">("All");
  const [sort, setSort] = useState<"newest" | "value" | "nextstep">("newest");
  const [filterOwner, setFilterOwner] = useState("");
  const [panelOpp, setPanelOpp] = useState<ClientOpportunity | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelInitialContactId, setPanelInitialContactId] = useState<string | undefined>(undefined);

  // Auto-open panel when routed from Contacts tab
  useEffect(() => {
    if (pendingContactId) {
      setPanelOpp(null);
      setPanelInitialContactId(pendingContactId);
      setPanelOpen(true);
    }
  }, [pendingContactId]);

  const filtered = opportunities.filter((o) => {
    if (stageFilter !== "All" && o.stage !== stageFilter) return false;
    if (filterOwner && o.assignedToClerkId !== filterOwner) return false;
    return true;
  });

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
    setPanelInitialContactId(undefined);
    setPanelOpen(true);
  }

  function openEdit(opp: ClientOpportunity) {
    setPanelOpp(opp);
    setPanelInitialContactId(undefined);
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
          {staffMembers.length > 0 && (
            <select
              value={filterOwner}
              onChange={e => setFilterOwner(e.target.value)}
              className="h-8 border border-gray-300 rounded-lg px-2 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-forest-500"
            >
              <option value="">All Owners</option>
              {staffMembers.filter(s => s.role === "TTTSales" || s.role === "TTTAdmin").map(s => (
                <option key={s.clerkUserId} value={s.clerkUserId}>{s.displayName}</option>
              ))}
            </select>
          )}
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
              <th className="text-left px-4 py-3 font-medium text-gray-600">Owner</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Stage</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Est. Value</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Next Step</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-gray-400">
                  No opportunities found
                </td>
              </tr>
            )}
            {sorted.map((opp) => {
              const ownerName = staffMembers.find(s => s.clerkUserId === (opp.assignedToClerkId || clientContacts.find(c => c.id === opp.clientContactId)?.assignedToClerkId))?.displayName;
              return (
              <tr key={opp.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => openEdit(opp)}>
                <td className="px-4 py-3 font-medium text-gray-900">{getContactName(opp.clientContactId)}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{ownerName || <span className="text-gray-400">—</span>}</td>
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
              );
            })}
          </tbody>
        </table>
      </div>

      {panelOpen && (
        <OpportunityPanel
          opportunity={panelOpp}
          clientContacts={clientContacts}
          staffMembers={staffMembers}
          gmailConnected={gmailConnected}
          onSaved={handleSaved}
          onClose={() => { setPanelOpen(false); clearPending?.(); }}
          initialContactId={panelInitialContactId}
        />
      )}
    </div>
  );
}

// ─── Opportunity Panel ────────────────────────────────────────────────────────
function OpportunityPanel({
  opportunity,
  clientContacts,
  staffMembers,
  gmailConnected,
  onSaved,
  onClose,
  initialContactId,
}: {
  opportunity: ClientOpportunity | null;
  clientContacts: ClientContact[];
  staffMembers: StaffMember[];
  gmailConnected: boolean;
  onSaved: (opp: ClientOpportunity) => void;
  onClose: () => void;
  initialContactId?: string;
}) {
  const router = useRouter();
  const [clientContactId, setClientContactId] = useState(opportunity?.clientContactId || initialContactId || "");
  const [stage, setStage] = useState<OpportunityStage>(opportunity?.stage || "Lead");
  const [estimatedValue, setEstimatedValue] = useState(String(opportunity?.estimatedValue || ""));
  const [notes, setNotes] = useState(opportunity?.notes || "");
  const [nextStepDate, setNextStepDate] = useState(opportunity?.nextStepDate || "");
  const [nextStepNote, setNextStepNote] = useState(opportunity?.nextStepNote || "");
  const [lostReason, setLostReason] = useState(opportunity?.lostReason || "");
  const [keyPeople, setKeyPeople] = useState<KeyPerson[]>(opportunity?.keyPeople || []);
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonRelationship, setNewPersonRelationship] = useState("");
  const [newPersonEmail, setNewPersonEmail] = useState("");
  const [activities, setActivities] = useState<CRMActivity[]>([]);
  const [activityType, setActivityType] = useState<CRMActivityType>("Note");
  const [activityNote, setActivityNote] = useState("");
  const [activityDate, setActivityDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [syncingGmail, setSyncingGmail] = useState(false);
  const [editingActivity, setEditingActivity] = useState<CRMActivity | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertedProject, setConvertedProject] = useState<{ id: string; name: string } | null>(null);

  // Derive owner from the selected contact; fall back to existing opportunity owner
  const derivedOwnerClerkId = clientContacts.find(c => c.id === clientContactId)?.assignedToClerkId || opportunity?.assignedToClerkId || "";
  const ownerName = staffMembers.find(s => s.clerkUserId === derivedOwnerClerkId)?.displayName;

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
    setSaveError(null);
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
        assignedToClerkId: derivedOwnerClerkId,
      };
      if (opportunity) {
        const res = await fetch("/api/crm/opportunities", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: opportunity.id, ...payload }),
        });
        const data = await res.json();
        if (!res.ok) {
          setSaveError(data.error || "Failed to save. Please try again.");
          return;
        }
        onSaved(data.opportunity);
      } else {
        const res = await fetch("/api/crm/opportunities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setSaveError(data.error || "Failed to create. Please try again.");
          return;
        }
        onSaved(data.opportunity);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function addKeyPerson() {
    if (!newPersonName) return;
    setKeyPeople((prev) => [
      ...prev,
      { name: newPersonName, relationship: newPersonRelationship, email: newPersonEmail || undefined },
    ]);
    setNewPersonName("");
    setNewPersonRelationship("");
    setNewPersonEmail("");
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

  async function deleteActivity(id: string) {
    if (!confirm("Delete this activity?")) return;
    await fetch(`/api/crm/activities?id=${id}`, { method: "DELETE" });
    setActivities((prev) => prev.filter((a) => a.id !== id));
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

  async function handleConvert() {
    const contact = clientContacts.find((c) => c.id === clientContactId);
    if (!contact) return;
    setConverting(true);
    try {
      // Save the opportunity first (same payload as handleSave)
      if (opportunity) {
        const oppPayload = {
          clientContactId,
          stage,
          estimatedValue: parseFloat(estimatedValue) || 0,
          notes,
          nextStepDate,
          nextStepNote,
          lostReason: stage === "Lost" ? lostReason : "",
          keyPeople,
          wonAt: opportunity.wonAt,
          lostAt: opportunity.lostAt,
          assignedToClerkId: derivedOwnerClerkId,
        };
        const oppRes = await fetch("/api/crm/opportunities", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: opportunity.id, ...oppPayload }),
        });
        if (oppRes.ok) {
          const oppData = await oppRes.json();
          onSaved(oppData.opportunity);
        }
      }
      // Create the project
      const res = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: contact.name, email: contact.email, displayName: contact.name }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setConvertedProject({ id: data.tenant.id, name: data.tenant.name });
      // Navigate to Quoting page for the new project
      router.push(`/quoting?tenantId=${data.tenant.id}`);
    } catch {
      alert("Failed to create project. Please try again.");
    } finally {
      setConverting(false);
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
            {ownerName && (
              <p className="text-xs text-gray-500 mt-1">Owner: <span className="font-medium text-gray-700">{ownerName}</span></p>
            )}
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
                  {p.email && <span className="text-gray-400 ml-0.5">· {p.email}</span>}
                  <button onClick={() => setKeyPeople((prev) => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 ml-1">×</button>
                </span>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <input
                value={newPersonName}
                onChange={(e) => setNewPersonName(e.target.value)}
                placeholder="Name"
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              />
              <input
                value={newPersonRelationship}
                onChange={(e) => setNewPersonRelationship(e.target.value)}
                placeholder="Relationship"
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              />
              <input
                type="email"
                value={newPersonEmail}
                onChange={(e) => setNewPersonEmail(e.target.value)}
                placeholder="Email (optional)"
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
            <button onClick={addKeyPerson} className="text-sm bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-1.5">
              Add Person
            </button>
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
          {saveError && (
            <p className="text-xs text-red-600 mt-1">{saveError}</p>
          )}

          {/* Convert to Project — available in Proposing stage */}
          {stage === "Proposing" && (
            convertedProject ? (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                Project created: <strong>{convertedProject.name}</strong>
                {" · "}
                <a href={`/quoting?tenantId=${convertedProject.id}`} className="underline font-medium">
                  Open Quoting
                </a>
              </div>
            ) : (
              <button
                onClick={handleConvert}
                disabled={converting || !clientContactId}
                className="w-full border border-purple-400 bg-purple-50 text-purple-700 rounded-lg py-2 text-sm font-medium hover:bg-purple-100 disabled:opacity-50 transition-colors"
              >
                {converting ? "Saving & creating project…" : "Convert to Project and Update Opp →"}
              </button>
            )
          )}

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
                  <div key={a.id} className="flex gap-3 text-sm group">
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
                    <div className="flex-shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditingActivity(a)}
                        className="text-xs text-gray-400 hover:text-forest-600 px-1 py-0.5"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteActivity(a.id)}
                        className="text-xs text-gray-400 hover:text-red-500 px-1 py-0.5"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {editingActivity && (
        <ActivityEditModal
          activity={editingActivity}
          onSaved={(updated) => {
            setActivities((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
            setEditingActivity(null);
          }}
          onClose={() => setEditingActivity(null)}
        />
      )}
    </div>
  );
}

// ─── Contact Activity Panel ───────────────────────────────────────────────────
function ContactActivityPanel({
  contact,
  onClose,
}: {
  contact: { id: string; name: string; email?: string };
  onClose: () => void;
}) {
  const [activities, setActivities] = useState<CRMActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityType, setActivityType] = useState<CRMActivityType>("Note");
  const [activityNote, setActivityNote] = useState("");
  const [activityDate, setActivityDate] = useState(new Date().toISOString().slice(0, 10));
  const [editingActivity, setEditingActivity] = useState<CRMActivity | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/crm/activities?contactId=${contact.id}`);
    if (res.ok) {
      const data = await res.json();
      setActivities(data.activities || []);
    }
    setLoading(false);
  }, [contact.id]);

  useEffect(() => { load(); }, [load]);

  async function logActivity() {
    if (!activityNote) return;
    const res = await fetch("/api/crm/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientContactId: contact.id,
        type: activityType,
        note: activityNote,
        activityDate: new Date(activityDate).toISOString(),
      }),
    });
    if (res.ok) {
      setActivityNote("");
      await load();
    }
  }

  async function deleteOne(id: string) {
    if (!confirm("Delete this activity?")) return;
    await fetch(`/api/crm/activities?id=${id}`, { method: "DELETE" });
    setActivities((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-white shadow-2xl overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{contact.name}</h2>
            {contact.email && <p className="text-xs text-gray-400">{contact.email}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 flex-1 space-y-5">
          {/* Log form */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Log Activity</h3>
            <div className="flex gap-2 mb-2">
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
            </div>
            <div className="flex gap-2">
              <textarea
                value={activityNote}
                onChange={(e) => setActivityNote(e.target.value)}
                placeholder="Note…"
                rows={2}
                className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none"
              />
              <button
                onClick={logActivity}
                disabled={!activityNote}
                className="text-sm bg-forest-600 text-white rounded-lg px-3 py-2 hover:bg-forest-700 disabled:opacity-50 self-end"
              >
                Log
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Activity History</h3>
            {loading ? (
              <p className="text-xs text-gray-400">Loading…</p>
            ) : activities.length === 0 ? (
              <p className="text-xs text-gray-400">No activities yet</p>
            ) : (
              <div className="space-y-3">
                {activities.map((a) => (
                  <div key={a.id} className="flex gap-3 group">
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
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{a.note}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {a.activityDate ? new Date(a.activityDate).toLocaleDateString() : ""}
                      </p>
                    </div>
                    <div className="flex-shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingActivity(a)} className="text-xs text-gray-400 hover:text-forest-600 px-1">Edit</button>
                      <button onClick={() => deleteOne(a.id)} className="text-xs text-gray-400 hover:text-red-500 px-1">×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {editingActivity && (
        <ActivityEditModal
          activity={editingActivity}
          onSaved={(updated) => {
            setActivities((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
            setEditingActivity(null);
          }}
          onClose={() => setEditingActivity(null)}
        />
      )}
    </div>
  );
}

// ─── Contacts Tab ─────────────────────────────────────────────────────────────
function ContactsTab({
  initialContacts,
  referralContacts,
  allClientContacts,
  staffMembers,
  onCreateOpportunity,
}: {
  initialContacts: ClientContact[];
  referralContacts: ReferralContact[];
  allClientContacts: ClientContact[];
  staffMembers: StaffMember[];
  onCreateOpportunity: (contactId: string) => void;
}) {
  const [contacts, setContacts] = useState(initialContacts);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClientContact | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", source: "", referralPartnerId: "", clientReferralId: "", notes: "", assignedToClerkId: "" });
  const [rpQuery, setRpQuery] = useState("");
  const [crQuery, setCrQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [activityContact, setActivityContact] = useState<ClientContact | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[] | null>(null);
  const [csvResult, setCsvResult] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target?.result as string);
      setCsvPreview(rows);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function confirmCsvImport() {
    if (!csvPreview) return;
    setCsvImporting(true);
    let imported = 0;
    let errors = 0;
    for (const row of csvPreview) {
      const name = row["name"] || row["contactname"] || row["fullname"] || "";
      if (!name) continue;
      try {
        const res = await fetch("/api/crm/client-contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email: row["email"] || row["emailaddress"] || "",
            phone: row["phone"] || row["phonenumber"] || row["mobile"] || "",
            source: row["source"] || "",
            notes: row["notes"] || row["note"] || "",
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setContacts(prev => [data.contact, ...prev]);
          imported++;
        } else { errors++; }
      } catch { errors++; }
    }
    setCsvImporting(false);
    setCsvPreview(null);
    setCsvResult(`Imported ${imported} contact${imported !== 1 ? "s" : ""}${errors ? `, ${errors} failed` : ""}.`);
  }

  function openNew() {
    setEditing(null);
    setForm({ name: "", email: "", phone: "", source: "", referralPartnerId: "", clientReferralId: "", notes: "", assignedToClerkId: "" });
    setRpQuery("");
    setCrQuery("");
    setModalOpen(true);
  }

  function openEdit(c: ClientContact) {
    setEditing(c);
    setForm({ name: c.name, email: c.email, phone: c.phone, source: c.source, referralPartnerId: c.referralPartnerId || "", clientReferralId: c.clientReferralId || "", notes: c.notes, assignedToClerkId: c.assignedToClerkId || "" });
    // Pre-fill combobox queries from existing IDs
    const rp = referralContacts.find((r) => r.id === c.referralPartnerId);
    setRpQuery(rp ? rp.name : "");
    const cr = allClientContacts.find((r) => r.id === c.clientReferralId);
    setCrQuery(cr ? cr.name : "");
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
      <div className="flex items-center justify-end mb-4">
        <button onClick={openNew} className="text-sm bg-forest-600 text-white rounded-lg px-3 py-1.5 hover:bg-forest-700">
          + Add Contact
        </button>
      </div>

      {csvPreview && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm font-medium text-blue-800 mb-2">
            Preview: {csvPreview.length} row{csvPreview.length !== 1 ? "s" : ""} to import
          </p>
          <div className="overflow-x-auto max-h-40 overflow-y-auto">
            <table className="text-xs w-full">
              <thead><tr className="text-blue-600">
                <th className="text-left pr-4 pb-1">Name</th>
                <th className="text-left pr-4 pb-1">Email</th>
                <th className="text-left pr-4 pb-1">Phone</th>
                <th className="text-left pr-4 pb-1">Source</th>
              </tr></thead>
              <tbody>
                {csvPreview.slice(0, 5).map((row, i) => (
                  <tr key={i} className="text-blue-900">
                    <td className="pr-4 py-0.5">{row["name"] || row["contactname"] || "—"}</td>
                    <td className="pr-4 py-0.5">{row["email"] || "—"}</td>
                    <td className="pr-4 py-0.5">{row["phone"] || "—"}</td>
                    <td className="pr-4 py-0.5">{row["source"] || "—"}</td>
                  </tr>
                ))}
                {csvPreview.length > 5 && (
                  <tr><td colSpan={4} className="text-blue-500 pt-1">…and {csvPreview.length - 5} more</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={confirmCsvImport}
              disabled={csvImporting}
              className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50"
            >
              {csvImporting ? "Importing…" : `Import ${csvPreview.length} contacts`}
            </button>
            <button onClick={() => setCsvPreview(null)} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Owner</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Source</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 && (
              <tr><td colSpan={6} className="text-center py-10 text-gray-400">No contacts yet</td></tr>
            )}
            {contacts.map((c) => (
              <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                  {staffMembers.find(s => s.clerkUserId === c.assignedToClerkId)?.displayName || <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-600">{c.email || "—"}</td>
                <td className="px-4 py-3 text-gray-600">{c.phone || "—"}</td>
                <td className="px-4 py-3 text-gray-600">{c.source || "—"}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    onClick={() => onCreateOpportunity(c.id)}
                    className="text-xs bg-forest-600 text-white rounded px-2 py-1 hover:bg-forest-700"
                    title="Create opportunity for this contact"
                  >
                    + Opp
                  </button>
                  <button
                    onClick={() => setActivityContact(c)}
                    className="text-forest-600 hover:text-forest-800 text-xs px-2 py-1"
                  >
                    Activities
                  </button>
                  <button onClick={() => openEdit(c)} className="text-gray-500 hover:text-gray-800 text-xs px-2 py-1">Edit</button>
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
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-gray-900">{editing ? "Edit Contact" : "Add Contact"}</h3>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="text" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="text" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>

            {/* Source */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
              <select
                value={form.source}
                onChange={(e) => {
                  setForm((f) => ({ ...f, source: e.target.value, referralPartnerId: "", clientReferralId: "" }));
                  setRpQuery("");
                  setCrQuery("");
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">— Select Source —</option>
                <option value="Referral Partner">Referral Partner</option>
                <option value="Client Referral">Client Referral</option>
                <option value="NASMM">NASMM</option>
                <option value="Web Lead">Web Lead</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Referral Partner combobox */}
            {form.source === "Referral Partner" && (
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Referred By (Referral Partner)</label>
                <input
                  type="text"
                  value={rpQuery}
                  onChange={(e) => { setRpQuery(e.target.value); setForm((f) => ({ ...f, referralPartnerId: "" })); }}
                  placeholder="Search referral partners…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  autoComplete="off"
                />
                {rpQuery && !form.referralPartnerId && (
                  <ul className="absolute z-20 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-44 overflow-auto w-full">
                    {referralContacts.filter((c) => c.name.toLowerCase().includes(rpQuery.toLowerCase())).slice(0, 8).map((c) => (
                      <li
                        key={c.id}
                        className="px-3 py-2 text-sm hover:bg-forest-50 cursor-pointer"
                        onMouseDown={(e) => { e.preventDefault(); setRpQuery(c.name); setForm((f) => ({ ...f, referralPartnerId: c.id })); }}
                      >
                        {c.name}
                      </li>
                    ))}
                    {referralContacts.filter((c) => c.name.toLowerCase().includes(rpQuery.toLowerCase())).length === 0 && (
                      <li className="px-3 py-2 text-sm text-gray-400">No matches</li>
                    )}
                  </ul>
                )}
                {form.referralPartnerId && (
                  <p className="text-xs text-forest-600 mt-1">Linked: {rpQuery}</p>
                )}
              </div>
            )}

            {/* Client Referral combobox */}
            {form.source === "Client Referral" && (
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Referred By (Client)</label>
                <input
                  type="text"
                  value={crQuery}
                  onChange={(e) => { setCrQuery(e.target.value); setForm((f) => ({ ...f, clientReferralId: "" })); }}
                  placeholder="Search client contacts…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  autoComplete="off"
                />
                {crQuery && !form.clientReferralId && (
                  <ul className="absolute z-20 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-44 overflow-auto w-full">
                    {allClientContacts.filter((c) => c.name.toLowerCase().includes(crQuery.toLowerCase()) && c.id !== editing?.id).slice(0, 8).map((c) => (
                      <li
                        key={c.id}
                        className="px-3 py-2 text-sm hover:bg-forest-50 cursor-pointer"
                        onMouseDown={(e) => { e.preventDefault(); setCrQuery(c.name); setForm((f) => ({ ...f, clientReferralId: c.id })); }}
                      >
                        {c.name}
                      </li>
                    ))}
                    {allClientContacts.filter((c) => c.name.toLowerCase().includes(crQuery.toLowerCase()) && c.id !== editing?.id).length === 0 && (
                      <li className="px-3 py-2 text-sm text-gray-400">No matches</li>
                    )}
                  </ul>
                )}
                {form.clientReferralId && (
                  <p className="text-xs text-forest-600 mt-1">Linked: {crQuery}</p>
                )}
              </div>
            )}

            {/* Owner */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Owner *</label>
              <select
                value={form.assignedToClerkId}
                onChange={(e) => setForm((f) => ({ ...f, assignedToClerkId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">— Select Owner —</option>
                {staffMembers.filter(s => s.role === "TTTSales" || s.role === "TTTAdmin").map(s => (
                  <option key={s.clerkUserId} value={s.clerkUserId}>{s.displayName}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModalOpen(false)} className="text-sm border border-gray-300 rounded-lg px-4 py-2">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name || !form.assignedToClerkId} className="text-sm bg-forest-600 text-white rounded-lg px-4 py-2 hover:bg-forest-700 disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activityContact && (
        <ContactActivityPanel
          contact={activityContact}
          onClose={() => setActivityContact(null)}
        />
      )}
    </div>
  );
}

// ─── Referral Partners Tab ────────────────────────────────────────────────────
const PRIORITY_COLORS: Record<string, string> = {
  High: "bg-red-100 text-red-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-gray-100 text-gray-600",
};

function ReferralPartnersTab({ initialCompanies, initialReferralContacts, staffMembers }: { initialCompanies: ReferralCompany[]; initialReferralContacts: ReferralContact[]; staffMembers: StaffMember[] }) {
  const [companies, setCompanies] = useState(initialCompanies);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Record<string, ReferralContact[]>>({});
  const [companyModal, setCompanyModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<ReferralCompany | null>(null);
  const [companyForm, setCompanyForm] = useState({ name: "", type: "", address: "", city: "", state: "", zip: "", priority: "" as ReferralPriority | "", notes: "", website: "", assignedToClerkId: "" });
  const [contactModal, setContactModal] = useState<string | null>(null);
  const [editingContact, setEditingContact] = useState<ReferralContact | null>(null);
  const [contactForm, setContactForm] = useState({ name: "", title: "", email: "", phone: "", notes: "", stage: "Identified" as ReferralContactStage, dateIntroduced: "", interests: "", coffeeOrder: "", orgsGroups: "", referralCompanyId: "" });
  const [companySearch, setCompanySearch] = useState("");
  const [companySearchOpen, setCompanySearchOpen] = useState(false);
  const [activityContact, setActivityContact] = useState<{ id: string; name: string; email?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [csvType, setCsvType] = useState<"companies" | "contacts" | null>(null);
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[] | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<string | null>(null);
  // Search / filter / sort / pagination
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState<"" | ReferralPriority>("");
  const [filterType, setFilterType] = useState("");
  const [filterOwner, setFilterOwner] = useState("");
  const [filterActiveOnly, setFilterActiveOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "priority">("name");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  // Determine which companies have at least one "Active Referral" contact
  // Uses lazily-loaded local contacts state when available, otherwise falls back to server data
  function isActiveReferralCompany(companyId: string): boolean {
    if (contacts[companyId]) {
      return contacts[companyId].some(c => c.stage === "Active Referral");
    }
    return initialReferralContacts.some(c => c.referralCompanyId === companyId && c.stage === "Active Referral");
  }

  function handleCsvFile(type: "companies" | "contacts", e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvType(type);
      setCsvPreview(parseCSV(ev.target?.result as string));
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function confirmCsvImport() {
    if (!csvPreview || !csvType) return;
    setCsvImporting(true);
    let imported = 0;
    let errors = 0;

    if (csvType === "companies") {
      for (const row of csvPreview) {
        const name = row["name"] || row["company"] || row["companyname"] || "";
        if (!name) continue;
        try {
          const res = await fetch("/api/crm/companies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              type: row["type"] || "",
              address: row["address"] || "",
              city: row["city"] || "",
              state: row["state"] || "",
              zip: row["zip"] || row["zipcode"] || "",
              notes: row["notes"] || "",
            }),
          });
          if (res.ok) {
            const data = await res.json();
            setCompanies(prev => [...prev, data.company]);
            imported++;
          } else { errors++; }
        } catch { errors++; }
      }
    } else {
      // contacts: match company by name from existing companies state
      const companyMap = new Map(companies.map(c => [c.name.toLowerCase(), c.id]));
      for (const row of csvPreview) {
        const name = row["name"] || row["contactname"] || row["fullname"] || "";
        if (!name) continue;
        const companyName = (row["company"] || row["companyname"] || "").toLowerCase();
        const referralCompanyId = companyMap.get(companyName) || "";
        try {
          const res = await fetch("/api/crm/contacts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              title: row["title"] || row["jobtitle"] || "",
              email: row["email"] || row["emailaddress"] || "",
              phone: row["phone"] || row["phonenumber"] || row["mobile"] || "",
              notes: row["notes"] || "",
              referralCompanyId,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (referralCompanyId) {
              setContacts(prev => ({
                ...prev,
                [referralCompanyId]: [...(prev[referralCompanyId] || []), data.contact],
              }));
            }
            imported++;
          } else { errors++; }
        } catch { errors++; }
      }
    }
    setCsvImporting(false);
    setCsvPreview(null);
    setCsvType(null);
    setCsvResult(`Imported ${imported} ${csvType === "companies" ? "compan" : "contact"}${imported !== 1 ? (csvType === "companies" ? "ies" : "s") : (csvType === "companies" ? "y" : "")}${errors ? `, ${errors} failed` : ""}.`);
  }

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
    setCompanyForm({ name: "", type: "", address: "", city: "", state: "", zip: "", priority: "", notes: "", website: "", assignedToClerkId: "" });
    setCompanyModal(true);
  }

  function openEditCompany(c: ReferralCompany) {
    setEditingCompany(c);
    setCompanyForm({ name: c.name, type: c.type, address: c.address || "", city: c.city || "", state: c.state || "", zip: c.zip || "", priority: c.priority || "", notes: c.notes, website: c.website || "", assignedToClerkId: c.assignedToClerkId || "" });
    setCompanyModal(true);
  }

  async function saveCompany() {
    if (!companyForm.name) return;
    setSaving(true);
    try {
      const payload = {
        name: companyForm.name,
        type: companyForm.type,
        address: companyForm.address,
        city: companyForm.city,
        state: companyForm.state,
        zip: companyForm.zip,
        priority: companyForm.priority,
        notes: companyForm.notes,
        website: companyForm.website,
        assignedToClerkId: companyForm.assignedToClerkId,
      };
      if (editingCompany) {
        const res = await fetch("/api/crm/companies", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingCompany.id, ...payload }),
        });
        const data = await res.json();
        setCompanies((prev) => prev.map((c) => (c.id === editingCompany.id ? data.company : c)));
      } else {
        const res = await fetch("/api/crm/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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
    setContactForm({ name: "", title: "", email: "", phone: "", notes: "", stage: "Identified", dateIntroduced: "", interests: "", coffeeOrder: "", orgsGroups: "", referralCompanyId: "" });
    setContactModal(companyId);
  }

  function openEditContact(contact: ReferralContact) {
    setEditingContact(contact);
    const currentCompany = companies.find(c => c.id === contact.referralCompanyId);
    setCompanySearch(currentCompany?.name || "");
    setCompanySearchOpen(false);
    setContactForm({ name: contact.name, title: contact.title, email: contact.email, phone: contact.phone, notes: contact.notes, stage: contact.stage || "Identified", dateIntroduced: contact.dateIntroduced || "", interests: contact.interests || "", coffeeOrder: contact.coffeeOrder || "", orgsGroups: contact.orgsGroups || "", referralCompanyId: contact.referralCompanyId });
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
        const oldCompanyId = editingContact.referralCompanyId;
        const newCompanyId = contactForm.referralCompanyId || oldCompanyId;
        if (newCompanyId !== oldCompanyId) {
          // Move contact from old company bucket to new one
          setContacts((prev) => {
            const next = { ...prev };
            next[oldCompanyId] = (next[oldCompanyId] || []).filter(c => c.id !== editingContact.id);
            next[newCompanyId] = [...(next[newCompanyId] || []), data.contact];
            return next;
          });
        } else {
          setContacts((prev) => ({
            ...prev,
            [contactModal]: (prev[contactModal] || []).map((c) => (c.id === editingContact.id ? data.contact : c)),
          }));
        }
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

  // Compute unique types for filter dropdown
  const allTypes = Array.from(new Set(companies.map(c => c.type).filter(Boolean))).sort();

  // Apply search / filter / sort
  const staffById = new Map(staffMembers.map(s => [s.clerkUserId, s.displayName]));
  const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2, "": 3 };

  // Build set of company IDs that have a contact whose name matches the search
  const searchLower = search.toLowerCase();
  const contactMatchIds = useMemo(() => {
    if (!search) return new Set<string>();
    return new Set(
      initialReferralContacts
        .filter(rc => rc.name.toLowerCase().includes(searchLower))
        .map(rc => rc.referralCompanyId)
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, initialReferralContacts]);

  const filtered = companies
    .filter(c => {
      if (search) {
        const companyMatch = c.name.toLowerCase().includes(searchLower) || c.type.toLowerCase().includes(searchLower);
        if (!companyMatch && !contactMatchIds.has(c.id)) return false;
      }
      if (filterPriority && c.priority !== filterPriority) return false;
      if (filterType && c.type !== filterType) return false;
      if (filterOwner && c.assignedToClerkId !== filterOwner) return false;
      if (filterActiveOnly && !isActiveReferralCompany(c.id)) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "priority") return (PRIORITY_ORDER[a.priority || ""] ?? 3) - (PRIORITY_ORDER[b.priority || ""] ?? 3);
      return a.name.localeCompare(b.name);
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleFilterChange<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1); };
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search companies or contacts…"
            className="h-8 border border-gray-300 rounded-lg px-3 text-sm w-56 focus:outline-none focus:ring-1 focus:ring-forest-500"
          />
          {/* Priority filter chips */}
          {(["", "High", "Medium", "Low"] as const).map(p => (
            <button
              key={p || "all"}
              onClick={() => handleFilterChange(setFilterPriority)(p)}
              className={cn(
                "h-7 px-2.5 text-xs rounded-full border transition-colors",
                filterPriority === p
                  ? "border-forest-600 bg-forest-50 text-forest-700 font-medium"
                  : "border-gray-300 text-gray-500 hover:border-gray-400"
              )}
            >
              {p || "All Priority"}
            </button>
          ))}
          <button
            onClick={() => { setFilterActiveOnly(v => !v); setPage(1); }}
            className={cn(
              "h-7 px-2.5 text-xs rounded-full border transition-colors",
              filterActiveOnly
                ? "border-green-600 bg-green-50 text-green-700 font-medium"
                : "border-gray-300 text-gray-500 hover:border-gray-400"
            )}
          >
            Active Partners
          </button>
          {allTypes.length > 0 && (
            <select
              value={filterType}
              onChange={e => handleFilterChange(setFilterType)(e.target.value)}
              className="h-7 border border-gray-300 rounded-lg px-2 text-xs text-gray-600 focus:outline-none"
            >
              <option value="">All Types</option>
              {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {staffMembers.length > 0 && (
            <select
              value={filterOwner}
              onChange={e => handleFilterChange(setFilterOwner)(e.target.value)}
              className="h-7 border border-gray-300 rounded-lg px-2 text-xs text-gray-600 focus:outline-none"
            >
              <option value="">All Owners</option>
              {staffMembers.filter(s => s.role === "TTTSales" || s.role === "TTTAdmin").map(s => (
                <option key={s.clerkUserId} value={s.clerkUserId}>{s.displayName}</option>
              ))}
            </select>
          )}
          <select
            value={sortBy}
            onChange={e => { setSortBy(e.target.value as "name" | "priority"); setPage(1); }}
            className="h-7 border border-gray-300 rounded-lg px-2 text-xs text-gray-600 focus:outline-none"
          >
            <option value="name">Sort: Name A–Z</option>
            <option value="priority">Sort: Priority</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openNewCompany} className="text-sm bg-forest-600 text-white rounded-lg px-3 py-1.5 hover:bg-forest-700">
            + Add Company
          </button>
        </div>
      </div>

      {csvResult && <p className="text-sm text-green-600 mb-3">{csvResult}</p>}

      {csvPreview && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm font-medium text-blue-800 mb-2">
            Preview: {csvPreview.length} {csvType === "companies" ? "compan" : "contact"}{csvPreview.length !== 1 ? (csvType === "companies" ? "ies" : "s") : (csvType === "companies" ? "y" : "")} to import
            {csvType === "contacts" && <span className="text-blue-600 font-normal"> — Company column matched to existing companies by name</span>}
          </p>
          <div className="overflow-x-auto max-h-40 overflow-y-auto">
            <table className="text-xs w-full">
              <thead><tr className="text-blue-600">
                {csvType === "companies" ? (
                  <><th className="text-left pr-4 pb-1">Name</th><th className="text-left pr-4 pb-1">Type</th><th className="text-left pr-4 pb-1">City</th><th className="text-left pb-1">State</th></>
                ) : (
                  <><th className="text-left pr-4 pb-1">Name</th><th className="text-left pr-4 pb-1">Title</th><th className="text-left pr-4 pb-1">Email</th><th className="text-left pb-1">Company</th></>
                )}
              </tr></thead>
              <tbody>
                {csvPreview.slice(0, 5).map((row, i) => (
                  <tr key={i} className="text-blue-900">
                    {csvType === "companies" ? (
                      <><td className="pr-4 py-0.5">{row["name"] || row["company"] || "—"}</td><td className="pr-4 py-0.5">{row["type"] || "—"}</td><td className="pr-4 py-0.5">{row["city"] || "—"}</td><td>{row["state"] || "—"}</td></>
                    ) : (
                      <><td className="pr-4 py-0.5">{row["name"] || row["contactname"] || "—"}</td><td className="pr-4 py-0.5">{row["title"] || "—"}</td><td className="pr-4 py-0.5">{row["email"] || "—"}</td><td>{row["company"] || row["companyname"] || "—"}</td></>
                    )}
                  </tr>
                ))}
                {csvPreview.length > 5 && (
                  <tr><td colSpan={4} className="text-blue-500 pt-1">…and {csvPreview.length - 5} more</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={confirmCsvImport}
              disabled={csvImporting}
              className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50"
            >
              {csvImporting ? "Importing…" : `Import ${csvPreview.length} ${csvType === "companies" ? (csvPreview.length !== 1 ? "companies" : "company") : (csvPreview.length !== 1 ? "contacts" : "contact")}`}
            </button>
            <button onClick={() => { setCsvPreview(null); setCsvType(null); }} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-center text-gray-400 py-10">{companies.length === 0 ? "No referral companies yet" : "No companies match your filters"}</p>
        )}
        {paginated.map((company) => (
          <div key={company.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
              onClick={() => toggleExpand(company.id)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-gray-400 text-sm flex-shrink-0">{expanded === company.id ? "▾" : "▸"}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-gray-900">{company.name}</span>
                    {company.type && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{company.type}</span>
                    )}
                    {company.priority && (
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", PRIORITY_COLORS[company.priority])}>{company.priority}</span>
                    )}
                    {isActiveReferralCompany(company.id) && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Active Partner</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-0.5 text-xs text-gray-500">
                    {(company.city || company.state) && (
                      <span>{[company.city, company.state].filter(Boolean).join(", ")}</span>
                    )}
                    {company.website && (
                      <a href={company.website.startsWith("http") ? company.website : `https://${company.website}`} target="_blank" rel="noopener noreferrer" className="text-forest-600 hover:underline" onClick={e => e.stopPropagation()}>
                        {company.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      </a>
                    )}
                    {company.assignedToClerkId && staffById.get(company.assignedToClerkId) && (
                      <span>Owner: {staffById.get(company.assignedToClerkId)}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => openEditCompany(company)} className="text-xs text-forest-600 hover:text-forest-800 px-2 py-1">Edit</button>
                <button onClick={() => deleteCompany(company.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1">Delete</button>
              </div>
            </div>

            {(expanded === company.id || (!!search && contactMatchIds.has(company.id))) && (
              <div className="border-t border-gray-100 px-4 py-3">
                {company.notes && (
                  <p className="text-xs text-gray-500 mb-3 italic">{company.notes}</p>
                )}
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contacts</span>
                  <button onClick={() => openAddContact(company.id)} className="text-xs text-forest-600 hover:text-forest-800">+ Add Contact</button>
                </div>
                {(() => {
                  const displayContacts = contacts[company.id] ?? initialReferralContacts.filter(rc => rc.referralCompanyId === company.id);
                  return displayContacts.length === 0 ? (
                    <p className="text-xs text-gray-400">No contacts</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500">
                          <th className="pb-1 font-medium">Name</th>
                          <th className="pb-1 font-medium">Stage</th>
                          <th className="pb-1 font-medium">Title</th>
                          <th className="pb-1 font-medium">Email</th>
                          <th className="pb-1 font-medium">Phone</th>
                          <th className="pb-1"></th>
                        </tr>
                      </thead>
                      <tbody>
                      {displayContacts.map((c) => (
                        <tr key={c.id} className="border-t border-gray-100">
                          <td className="py-1.5 font-medium text-gray-800">{c.name}</td>
                          <td className="py-1.5">
                            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", REF_STAGE_COLORS[c.stage || "Identified"])}>
                              {c.stage || "Identified"}
                            </span>
                          </td>
                          <td className="py-1.5 text-gray-600">{c.title || "—"}</td>
                          <td className="py-1.5 text-gray-600">{c.email || "—"}</td>
                          <td className="py-1.5 text-gray-600">{c.phone || "—"}</td>
                          <td className="py-1.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setActivityContact({ id: c.id, name: c.name, email: c.email || undefined })}
                                className="text-xs px-2 py-0.5 rounded-full border border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-400 transition-colors"
                              >
                                Log
                              </button>
                              <button onClick={() => openEditContact(c)} className="text-xs text-forest-600 hover:text-forest-800 px-1">Edit</button>
                              <button onClick={() => deleteContact(company.id, c.id)} className="text-xs text-red-500 hover:text-red-700 px-1">Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          <p className="text-sm text-gray-500">
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="h-8 px-3 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .reduce<(number | "…")[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "…" ? (
                  <span key={`ellipsis-${i}`} className="px-1 text-gray-400 text-sm">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={cn(
                      "h-8 w-8 text-sm rounded-lg border transition-colors",
                      safePage === p
                        ? "border-forest-600 bg-forest-50 text-forest-700 font-medium"
                        : "border-gray-300 text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="h-8 px-3 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Company Modal */}
      {companyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCompanyModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-gray-900">{editingCompany ? "Edit Company" : "Add Company"}</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input type="text" value={companyForm.name} onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select value={companyForm.type} onChange={(e) => setCompanyForm((f) => ({ ...f, type: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">— Select type —</option>
                  {COMPANY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select value={companyForm.priority} onChange={(e) => setCompanyForm((f) => ({ ...f, priority: e.target.value as ReferralPriority | "" }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">— None —</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
              <select value={companyForm.assignedToClerkId} onChange={(e) => setCompanyForm((f) => ({ ...f, assignedToClerkId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">— Unassigned —</option>
                {staffMembers.filter(s => s.role === "TTTSales" || s.role === "TTTAdmin").map(s => <option key={s.clerkUserId} value={s.clerkUserId}>{s.displayName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input type="text" value={companyForm.address} onChange={(e) => setCompanyForm((f) => ({ ...f, address: e.target.value }))} placeholder="Street address" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input type="text" value={companyForm.city} onChange={(e) => setCompanyForm((f) => ({ ...f, city: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <input type="text" value={companyForm.state} onChange={(e) => setCompanyForm((f) => ({ ...f, state: e.target.value }))} maxLength={2} placeholder="IL" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zip</label>
                <input type="text" value={companyForm.zip} onChange={(e) => setCompanyForm((f) => ({ ...f, zip: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
              <input type="url" value={companyForm.website} onChange={(e) => setCompanyForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://example.com" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
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
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-gray-900">{editingContact ? "Edit Contact" : "Add Contact"}</h3>

            {/* Stage */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Stage</label>
              <div className="flex flex-wrap gap-1.5">
                {REFERRAL_STAGES.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setContactForm(f => ({ ...f, stage: s }))}
                    className={cn(
                      "text-xs px-3 py-1.5 rounded-full border font-medium transition-colors",
                      contactForm.stage === s
                        ? cn(REF_STAGE_COLORS[s], "border-transparent shadow-sm")
                        : "border-gray-200 text-gray-500 hover:border-gray-400 bg-white"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Company (edit only) */}
            {editingContact && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                <div className="relative">
                  <input
                    type="text"
                    value={companySearch}
                    onChange={(e) => { setCompanySearch(e.target.value); setCompanySearchOpen(true); }}
                    onFocus={() => setCompanySearchOpen(true)}
                    onBlur={() => setTimeout(() => setCompanySearchOpen(false), 150)}
                    placeholder="Search companies…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm pr-8"
                  />
                  {companySearch && (
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); setCompanySearch(""); setContactForm(f => ({ ...f, referralCompanyId: "" })); setCompanySearchOpen(false); }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                    >✕</button>
                  )}
                  {companySearchOpen && (
                    <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto text-sm">
                      {companies
                        .filter(c => !companySearch || c.name.toLowerCase().includes(companySearch.toLowerCase()))
                        .slice(0, 20)
                        .map(c => (
                          <li
                            key={c.id}
                            onMouseDown={(e) => { e.preventDefault(); setContactForm(f => ({ ...f, referralCompanyId: c.id })); setCompanySearch(c.name); setCompanySearchOpen(false); }}
                            className={cn(
                              "px-3 py-2 cursor-pointer hover:bg-forest-50",
                              contactForm.referralCompanyId === c.id && "bg-forest-50 font-medium text-forest-700"
                            )}
                          >
                            {c.name}
                          </li>
                        ))
                      }
                      {companies.filter(c => !companySearch || c.name.toLowerCase().includes(companySearch.toLowerCase())).length === 0 && (
                        <li className="px-3 py-2 text-gray-400">No companies found</li>
                      )}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* Core fields */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input type="text" value={contactForm.name} onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input type="text" value={contactForm.title} onChange={(e) => setContactForm((f) => ({ ...f, title: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="text" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="text" value={contactForm.phone} onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>

            {/* Relationship fields */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Relationship Details</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date Introduced</label>
                  <input type="date" value={contactForm.dateIntroduced} onChange={(e) => setContactForm((f) => ({ ...f, dateIntroduced: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Coffee Order</label>
                  <input type="text" value={contactForm.coffeeOrder} onChange={(e) => setContactForm((f) => ({ ...f, coffeeOrder: e.target.value }))} placeholder="e.g. Oat milk latte, no sugar" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Interests</label>
                  <textarea value={contactForm.interests} onChange={(e) => setContactForm((f) => ({ ...f, interests: e.target.value }))} rows={2} placeholder="e.g. Golf, travel, family…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Orgs / Groups</label>
                  <textarea value={contactForm.orgsGroups} onChange={(e) => setContactForm((f) => ({ ...f, orgsGroups: e.target.value }))} rows={2} placeholder="e.g. Rotary Club, NASMM, Chamber of Commerce…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={contactForm.notes} onChange={(e) => setContactForm((f) => ({ ...f, notes: e.target.value }))} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setContactModal(null)} className="text-sm border border-gray-300 rounded-lg px-4 py-2">Cancel</button>
              <button onClick={saveContact} disabled={saving || !contactForm.name} className="text-sm bg-forest-600 text-white rounded-lg px-4 py-2 hover:bg-forest-700 disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activityContact && (
        <ContactActivityPanel
          contact={activityContact}
          onClose={() => setActivityContact(null)}
        />
      )}
    </div>
  );
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────
const STAGE_BORDER: Record<OpportunityStage, string> = {
  Lead: "border-blue-400",
  Qualifying: "border-amber-400",
  "Proposing": "border-purple-400",
  Won: "border-green-500",
  Lost: "border-gray-300",
};

const STAGE_HEADER_BG: Record<OpportunityStage, string> = {
  Lead: "bg-blue-50",
  Qualifying: "bg-amber-50",
  "Proposing": "bg-purple-50",
  Won: "bg-green-50",
  Lost: "bg-gray-50",
};

const STAGE_COUNT_COLOR: Record<OpportunityStage, string> = {
  Lead: "bg-blue-100 text-blue-700",
  Qualifying: "bg-amber-100 text-amber-700",
  "Proposing": "bg-purple-100 text-purple-700",
  Won: "bg-green-100 text-green-700",
  Lost: "bg-gray-100 text-gray-500",
};

const COMPANY_TYPE_COLORS: Record<string, string> = {
  "Senior Living": "bg-teal-100 text-teal-700",
  "Realtor": "bg-blue-100 text-blue-700",
  "Broker": "bg-indigo-100 text-indigo-700",
  "Doctor": "bg-red-100 text-red-700",
  "Attorney": "bg-amber-100 text-amber-700",
  "Hospital": "bg-pink-100 text-pink-700",
  "Financial Advisor": "bg-green-100 text-green-700",
  "Other": "bg-gray-100 text-gray-600",
};

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function DashboardTab({
  opportunities,
  clientContacts,
  companies,
  referralContacts,
  staffMembers,
}: {
  opportunities: ClientOpportunity[];
  clientContacts: ClientContact[];
  companies: ReferralCompany[];
  referralContacts: ReferralContact[];
  staffMembers: StaffMember[];
}) {
  const [ownerFilter, setOwnerFilter] = useState("");

  // Apply owner filter
  const staffById = new Map(staffMembers.map(s => [s.clerkUserId, s.displayName]));
  const filteredOpps = ownerFilter ? opportunities.filter(o => o.assignedToClerkId === ownerFilter) : opportunities;
  const filteredCompanies = ownerFilter ? companies.filter(c => c.assignedToClerkId === ownerFilter) : companies;
  const filteredCompanyIds = new Set(filteredCompanies.map(c => c.id));
  const filteredRefContacts = referralContacts.filter(c => filteredCompanyIds.has(c.referralCompanyId));

  const activeStages: OpportunityStage[] = ["Lead", "Qualifying", "Proposing"];
  const pipelineValue = filteredOpps.filter((o) => activeStages.includes(o.stage)).reduce((s, o) => s + o.estimatedValue, 0);
  const wonValue = filteredOpps.filter((o) => o.stage === "Won").reduce((s, o) => s + o.estimatedValue, 0);
  const wonCount = filteredOpps.filter((o) => o.stage === "Won").length;
  const lostCount = filteredOpps.filter((o) => o.stage === "Lost").length;
  const closedCount = wonCount + lostCount;
  const winRate = closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : 0;

  const byStage = STAGES.map((stage) => ({
    stage,
    opps: filteredOpps.filter((o) => o.stage === stage),
    value: filteredOpps.filter((o) => o.stage === stage).reduce((s, o) => s + o.estimatedValue, 0),
  }));

  const typeGroups = filteredCompanies.reduce<Record<string, number>>((acc, c) => {
    const t = c.type || "Other";
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  // Referral Partner Pipeline funnel
  const refFunnel = REFERRAL_STAGES.map(stage => ({
    stage,
    count: filteredRefContacts.filter(c => (c.stage || "Identified") === stage).length,
  }));
  const maxRefCount = Math.max(1, ...refFunnel.map(f => f.count));
  const activePartnerCount = filteredCompanies.filter(c =>
    referralContacts.some(rc => rc.referralCompanyId === c.id && rc.stage === "Active Referral")
  ).length;

  function getContactName(id: string) {
    return clientContacts.find((c) => c.id === id)?.name || "—";
  }

  return (
    <div className="space-y-8">
      {/* Owner filter */}
      {staffMembers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-1">View:</span>
          <button
            onClick={() => setOwnerFilter("")}
            className={cn(
              "h-7 px-3 text-xs rounded-full border transition-colors",
              ownerFilter === "" ? "border-forest-600 bg-forest-50 text-forest-700 font-medium" : "border-gray-300 text-gray-500 hover:border-gray-400"
            )}
          >
            All
          </button>
          {staffMembers.filter(s => s.role === "TTTSales" || s.role === "TTTAdmin").map(s => (
            <button
              key={s.clerkUserId}
              onClick={() => setOwnerFilter(o => o === s.clerkUserId ? "" : s.clerkUserId)}
              className={cn(
                "h-7 px-3 text-xs rounded-full border transition-colors",
                ownerFilter === s.clerkUserId ? "border-forest-600 bg-forest-50 text-forest-700 font-medium" : "border-gray-300 text-gray-500 hover:border-gray-400"
              )}
            >
              {s.displayName}
            </button>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Active Pipeline</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(pipelineValue)}</p>
          <p className="text-xs text-gray-400 mt-1">{filteredOpps.filter((o) => activeStages.includes(o.stage)).length} open opportunities</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Won Revenue</p>
          <p className="text-2xl font-bold text-green-600">{fmt(wonValue)}</p>
          <p className="text-xs text-gray-400 mt-1">{wonCount} deal{wonCount !== 1 ? "s" : ""} closed</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Active Referral Partners</p>
          <p className="text-2xl font-bold text-green-600">{activePartnerCount}</p>
          <p className="text-xs text-gray-400 mt-1">of {filteredCompanies.length} total partners</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Win Rate</p>
          <p className={cn("text-2xl font-bold", winRate >= 50 ? "text-green-600" : winRate > 0 ? "text-amber-600" : "text-gray-400")}>
            {closedCount > 0 ? `${winRate}%` : "—"}
          </p>
          <p className="text-xs text-gray-400 mt-1">{wonCount}W / {lostCount}L closed</p>
        </div>
      </div>

      {/* Opportunities Pipeline */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Opportunities Pipeline</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {byStage.map(({ stage, opps, value }) => (
            <div key={stage} className={cn("bg-white rounded-xl border-t-4 border border-gray-200 shadow-sm overflow-hidden", STAGE_BORDER[stage])}>
              <div className={cn("px-4 py-3", STAGE_HEADER_BG[stage])}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-700">{stage}</span>
                  <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded-full", STAGE_COUNT_COLOR[stage])}>
                    {opps.length}
                  </span>
                </div>
                <p className="text-sm font-bold text-gray-900">{value > 0 ? fmt(value) : "—"}</p>
              </div>
              <div className="divide-y divide-gray-100">
                {opps.length === 0 && (
                  <p className="text-xs text-gray-400 px-4 py-3">No opportunities</p>
                )}
                {opps.slice(0, 5).map((o) => {
                  const oppOwner = staffById.get(o.assignedToClerkId || "");
                  return (
                  <div key={o.id} className="px-4 py-2.5">
                    <p className="text-xs font-medium text-gray-800 truncate">{getContactName(o.clientContactId)}</p>
                    <p className="text-xs text-gray-400">
                      {o.estimatedValue > 0 ? fmt(o.estimatedValue) : "No value"}
                      {o.nextStepDate ? ` · ${new Date(o.nextStepDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                      {oppOwner ? ` · ${oppOwner}` : ""}
                    </p>
                  </div>
                  );
                })}
                {opps.length > 5 && (
                  <p className="text-xs text-gray-400 px-4 py-2">+{opps.length - 5} more</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Referral Partner Pipeline */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Referral Partner Pipeline</h2>
        {filteredRefContacts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
            No referral contacts yet — add them in the Referral Partners tab
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {refFunnel.map(({ stage, count }) => (
              <div key={stage} className="flex items-center gap-4 px-5 py-3">
                <div className="w-36 flex-shrink-0">
                  <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", REF_STAGE_COLORS[stage])}>
                    {stage}
                  </span>
                </div>
                <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", {
                      "bg-gray-400":    stage === "Identified",
                      "bg-blue-400":    stage === "Met",
                      "bg-purple-400":  stage === "Agreed to Refer",
                      "bg-amber-400":   stage === "Shared Leads",
                      "bg-green-500":   stage === "Active Referral",
                      "bg-red-300":     stage === "Inactive Referral",
                    })}
                    style={{ width: `${(count / maxRefCount) * 100}%` }}
                  />
                </div>
                <div className="w-12 text-right">
                  <span className="text-sm font-semibold text-gray-800">{count}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Referral Partner Network */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Referral Partner Network</h2>
        {filteredCompanies.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
            No referral partners yet — add them in the Referral Partners tab
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(typeGroups)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <div key={type} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center justify-between">
                  <div>
                    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", COMPANY_TYPE_COLORS[type] || "bg-gray-100 text-gray-600")}>
                      {type}
                    </span>
                    <p className="text-lg font-bold text-gray-900 mt-2">{count}</p>
                    <p className="text-xs text-gray-400">{count === 1 ? "partner" : "partners"}</p>
                  </div>
                </div>
              ))}
            <div className="bg-forest-50 rounded-xl border border-forest-200 p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-forest-600 uppercase tracking-wide">Total</p>
                <p className="text-lg font-bold text-forest-800 mt-2">{filteredCompanies.length}</p>
                <p className="text-xs text-forest-600">all partners</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Contact Search ───────────────────────────────────────────────────────────
function ContactSearch({
  clientContacts,
  referralContacts,
  selectedId,
  onSelect,
}: {
  clientContacts: ClientContact[];
  referralContacts: ReferralContact[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const allContacts = [
    ...clientContacts.map((c) => ({ id: c.id, name: c.name, label: "Client" })),
    ...referralContacts.map((c) => ({ id: c.id, name: c.name, label: "Referral" })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const selectedName = allContacts.find((c) => c.id === selectedId)?.name ?? "";
  const [inputValue, setInputValue] = useState(selectedName);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setInputValue(selectedName);
  }, [selectedName]);

  const filtered = inputValue
    ? allContacts.filter((c) => c.name.toLowerCase().includes(inputValue.toLowerCase()))
    : allContacts;

  return (
    <div className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          if (!e.target.value) onSelect("");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="Search contacts…"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto mt-1">
          {filtered.slice(0, 20).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(c.id);
                  setInputValue(c.name);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
              >
                <span>{c.name}</span>
                <span className="text-xs text-gray-400 ml-2">{c.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Activity Log Tab ─────────────────────────────────────────────────────────
const ACTIVITY_TYPE_COLORS: Record<string, string> = {
  Call: "bg-green-100 text-green-700",
  Email: "bg-blue-100 text-blue-700",
  Meeting: "bg-purple-100 text-purple-700",
  Note: "bg-gray-100 text-gray-600",
  Task: "bg-orange-100 text-orange-700",
};

function ActivityLogTab({
  opportunities,
  clientContacts,
  referralContacts,
  staffMembers,
  gmailConnected,
}: {
  opportunities: ClientOpportunity[];
  clientContacts: ClientContact[];
  referralContacts: ReferralContact[];
  staffMembers: StaffMember[];
  gmailConnected: boolean;
}) {
  const [activities, setActivities] = useState<CRMActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<CRMActivityType | "All">("All");
  const [staffFilter, setStaffFilter] = useState<string>("All");
  const [sortCol, setSortCol] = useState<"date" | "name" | "type" | "client">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingActivity, setEditingActivity] = useState<CRMActivity | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logForm, setLogForm] = useState({ contactId: "", type: "Note" as CRMActivityType, note: "", date: new Date().toISOString().slice(0, 10) });
  const [logging, setLogging] = useState(false);
  const [syncingGmail, setSyncingGmail] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const staffById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of staffMembers) m[s.clerkUserId] = s.displayName;
    return m;
  }, [staffMembers]);

  const reload = useCallback(() => {
    setLoading(true);
    fetch("/api/crm/activities")
      .then((r) => r.json())
      .then((d) => setActivities(d.activities || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  function getContactName(activity: CRMActivity) {
    if (activity.clientContactId) {
      const client = clientContacts.find((c) => c.id === activity.clientContactId);
      if (client) return client.name;
      const referral = referralContacts.find((c) => c.id === activity.clientContactId);
      if (referral) return referral.name;
    }
    const opp = opportunities.find((o) => o.id === activity.opportunityId);
    if (!opp) return "—";
    return clientContacts.find((c) => c.id === opp.clientContactId)?.name || "—";
  }

  function getContactType(activity: CRMActivity): "Client" | "Referral" | null {
    if (activity.clientContactId) {
      if (clientContacts.some((c) => c.id === activity.clientContactId)) return "Client";
      if (referralContacts.some((c) => c.id === activity.clientContactId)) return "Referral";
    }
    const opp = opportunities.find((o) => o.id === activity.opportunityId);
    if (opp) return "Client";
    return null;
  }

  async function handleLog() {
    if (!logForm.contactId || !logForm.note) return;
    setLogging(true);
    try {
      await fetch("/api/crm/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientContactId: logForm.contactId,
          type: logForm.type,
          note: logForm.note,
          activityDate: new Date(logForm.date).toISOString(),
        }),
      });
      setLogModalOpen(false);
      setLogForm({ contactId: "", type: "Note", note: "", date: new Date().toISOString().slice(0, 10) });
      reload();
    } finally {
      setLogging(false);
    }
  }

  async function handleSyncAll() {
    setSyncingGmail(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/crm/gmail/sync-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncResult(`Error: ${data.error || "Sync failed"}`);
      } else {
        setSyncResult(`Imported ${data.imported} new email${data.imported !== 1 ? "s" : ""} across ${data.contactsSearched} contact${data.contactsSearched !== 1 ? "s" : ""}`);
        reload();
      }
    } catch {
      setSyncResult("Sync failed — check your Gmail connection");
    } finally {
      setSyncingGmail(false);
    }
  }

  function handleSort(col: "date" | "name" | "type" | "client") {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  function SortIcon({ col }: { col: "date" | "name" | "type" | "client" }) {
    if (sortCol !== col) return <span className="ml-1 opacity-30">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const filtered = useMemo(() => {
    let list = activities.filter((a) => {
      if (typeFilter !== "All" && a.type !== typeFilter) return false;
      if (staffFilter !== "All" && a.createdByClerkId !== staffFilter) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      let av = "";
      let bv = "";
      if (sortCol === "date") {
        av = a.activityDate || a.createdAt || "";
        bv = b.activityDate || b.createdAt || "";
      } else if (sortCol === "name") {
        av = staffById[a.createdByClerkId] || "";
        bv = staffById[b.createdByClerkId] || "";
      } else if (sortCol === "type") {
        av = a.type;
        bv = b.type;
      } else if (sortCol === "client") {
        av = getContactName(a);
        bv = getContactName(b);
      }
      const cmp = av.localeCompare(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities, typeFilter, staffFilter, sortCol, sortDir, staffById, clientContacts, referralContacts, opportunities]);

  const allSelected = filtered.length > 0 && filtered.every((a) => selected.has(a.id));

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((a) => next.delete(a.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((a) => next.add(a.id));
        return next;
      });
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function deleteOne(id: string) {
    if (!confirm("Delete this activity?")) return;
    await fetch(`/api/crm/activities?id=${id}`, { method: "DELETE" });
    setActivities((prev) => prev.filter((a) => a.id !== id));
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }

  async function deleteSelected() {
    if (!confirm(`Delete ${selected.size} selected activit${selected.size === 1 ? "y" : "ies"}?`)) return;
    await Promise.all([...selected].map((id) => fetch(`/api/crm/activities?id=${id}`, { method: "DELETE" })));
    setActivities((prev) => prev.filter((a) => !selected.has(a.id)));
    setSelected(new Set());
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {(["All", "Call", "Email", "Meeting", "Note", "Task"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
              typeFilter === t
                ? "bg-forest-600 text-white border-forest-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-forest-400"
            )}
          >
            {t}
          </button>
        ))}
        <div className="w-px h-4 bg-gray-200 mx-1" />
        {[{ id: "All", label: "All" }, ...staffMembers.filter(s => s.role === "TTTSales" || s.role === "TTTAdmin").map((s) => ({ id: s.clerkUserId, label: s.displayName }))].map((s) => (
          <button
            key={s.id}
            onClick={() => setStaffFilter(s.id)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
              staffFilter === s.id
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
            )}
          >
            {s.label}
          </button>
        ))}
        <span className="text-xs text-gray-400">{filtered.length} activities</span>
        {selected.size > 0 && (
          <button
            onClick={deleteSelected}
            className="text-xs text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50"
          >
            Delete {selected.size} selected
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {gmailConnected && (
            <button
              onClick={handleSyncAll}
              disabled={syncingGmail}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
              </svg>
              {syncingGmail ? "Syncing…" : "Sync Gmail"}
            </button>
          )}
          <button
            onClick={() => setLogModalOpen(true)}
            className="text-sm bg-forest-600 text-white rounded-lg px-3 py-1.5 hover:bg-forest-700"
          >
            + Log Activity
          </button>
        </div>
      </div>
      {syncResult && (
        <div className="mb-4 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center justify-between">
          <span>{syncResult}</span>
          <button onClick={() => setSyncResult(null)} className="ml-4 text-blue-400 hover:text-blue-600 text-xs">✕</button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="text-center py-10 text-sm text-gray-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center py-10 text-sm text-gray-400">No activities yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  <button onClick={() => handleSort("date")} className="flex items-center hover:text-gray-900">
                    Date<SortIcon col="date" />
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  <button onClick={() => handleSort("name")} className="flex items-center hover:text-gray-900">
                    Name<SortIcon col="name" />
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  <button onClick={() => handleSort("type")} className="flex items-center hover:text-gray-900">
                    Type<SortIcon col="type" />
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  <button onClick={() => handleSort("client")} className="flex items-center hover:text-gray-900">
                    Name<SortIcon col="client" />
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contact Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Note</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className={cn("border-b border-gray-100 hover:bg-gray-50", selected.has(a.id) && "bg-blue-50")}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggleOne(a.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {a.activityDate ? new Date(a.activityDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {staffById[a.createdByClerkId] || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", ACTIVITY_TYPE_COLORS[a.type] || "bg-gray-100 text-gray-600")}>
                      {a.type}
                      {a.isGmailImported && " ✉"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{getContactName(a)}</td>
                  <td className="px-4 py-3">
                    {(() => {
                      const t = getContactType(a);
                      if (!t) return <span className="text-gray-400">—</span>;
                      return (
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-xs font-medium",
                          t === "Client" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                        )}>
                          {t}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{a.note}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => setEditingActivity(a)}
                      className="text-xs text-forest-600 hover:text-forest-800 px-2 py-1"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteOne(a.id)}
                      className="text-xs text-red-500 hover:text-red-700 px-2 py-1"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editingActivity && (
        <ActivityEditModal
          activity={editingActivity}
          onSaved={(updated) => {
            setActivities((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
            setEditingActivity(null);
          }}
          onClose={() => setEditingActivity(null)}
        />
      )}

      {logModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setLogModalOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Log Activity</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact *</label>
              <ContactSearch
                clientContacts={clientContacts}
                referralContacts={referralContacts}
                selectedId={logForm.contactId}
                onSelect={(id) => setLogForm((f) => ({ ...f, contactId: id }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={logForm.type}
                  onChange={(e) => setLogForm((f) => ({ ...f, type: e.target.value as CRMActivityType }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  {(["Call", "Email", "Meeting", "Note", "Task"] as CRMActivityType[]).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={logForm.date}
                  onChange={(e) => setLogForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note *</label>
              <textarea
                value={logForm.note}
                onChange={(e) => setLogForm((f) => ({ ...f, note: e.target.value }))}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setLogModalOpen(false)} className="text-sm border border-gray-300 rounded-lg px-4 py-2">Cancel</button>
              <button
                onClick={handleLog}
                disabled={logging || !logForm.contactId || !logForm.note}
                className="text-sm bg-forest-600 text-white rounded-lg px-4 py-2 hover:bg-forest-700 disabled:opacity-50"
              >
                {logging ? "Saving…" : "Log Activity"}
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
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

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

  async function handleSyncAll() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/crm/gmail/sync-all", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(`Sync complete — ${data.imported} emails imported from ${data.contactsSearched} contacts.`);
      } else {
        setSyncResult(`Sync failed: ${data.error || "Unknown error"}`);
      }
    } catch {
      setSyncResult("Sync failed: network error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Gmail Integration</h3>
      <p className="text-sm text-gray-600 mb-6">
        Connect your Gmail account to automatically capture email threads as CRM activities on any opportunity.
      </p>

      {connected ? (
        <div className="space-y-3">
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
          <div className="flex items-center gap-3">
            <button
              onClick={handleSyncAll}
              disabled={syncing}
              className="flex items-center gap-2 text-sm border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
              </svg>
              {syncing ? "Syncing all emails…" : "Sync All Emails"}
            </button>
            {syncResult && (
              <p className="text-sm text-gray-600">{syncResult}</p>
            )}
          </div>
          <p className="text-xs text-gray-400">
            Sync All imports the last 20 emails per contact across your entire CRM.
          </p>
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
export function CRMClient({ opportunities, clientContacts, companies, referralContacts, staffMembers, gmailConnected, gmailEmail }: CRMClientProps) {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab | null) || "dashboard";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [pendingContactId, setPendingContactId] = useState<string | null>(null);

  function handleCreateOpportunity(contactId: string) {
    setPendingContactId(contactId);
    setTab("opportunities");
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "opportunities", label: "Opportunities" },
    { key: "contacts", label: "Contacts" },
    { key: "referrals", label: "Referral Partners" },
    { key: "activity", label: "Activity Log" },
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

      {tab === "dashboard" && (
        <DashboardTab opportunities={opportunities} clientContacts={clientContacts} companies={companies} referralContacts={referralContacts} staffMembers={staffMembers} />
      )}
      {tab === "opportunities" && (
        <OpportunitiesTab
          initialOpportunities={opportunities}
          clientContacts={clientContacts}
          staffMembers={staffMembers}
          gmailConnected={gmailConnected}
          pendingContactId={pendingContactId}
          clearPending={() => setPendingContactId(null)}
        />
      )}
      {tab === "contacts" && <ContactsTab initialContacts={clientContacts} referralContacts={referralContacts} allClientContacts={clientContacts} staffMembers={staffMembers} onCreateOpportunity={handleCreateOpportunity} />}
      {tab === "referrals" && <ReferralPartnersTab initialCompanies={companies} initialReferralContacts={referralContacts} staffMembers={staffMembers} />}
      {tab === "activity" && (
        <ActivityLogTab opportunities={opportunities} clientContacts={clientContacts} referralContacts={referralContacts} staffMembers={staffMembers} gmailConnected={gmailConnected} />
      )}
      {tab === "settings" && <GmailSettingsTab gmailConnected={gmailConnected} gmailEmail={gmailEmail} />}
    </div>
  );
}
