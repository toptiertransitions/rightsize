"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import type {
  OutreachSequence, OutreachSequenceStep, OutreachSequenceStatus,
  OutreachStepChannel, OutreachTaskType, OutreachContactType,
} from "@/lib/types";
import type { ReferralCompany, StaffMember } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const REFERRAL_STAGES = [
  "Identified", "Met", "Agreed to Refer", "Shared Leads",
  "Active Referral", "Inactive Referral",
];

const CLIENT_STAGES = [
  "Lead", "Consultation Scheduled", "Consultation Completed",
  "Active Client", "Placed", "Closed", "Lost",
];

const TASK_TYPES: OutreachTaskType[] = [
  "LinkedIn", "Handwritten Note", "Custom", "SMS", "Drop In",
];

const STATUS_COLORS: Record<OutreachSequenceStatus, string> = {
  Draft: "bg-gray-100 text-gray-600",
  Active: "bg-green-100 text-green-700",
  Archived: "bg-amber-100 text-amber-700",
};

const CHANNEL_COLORS: Record<OutreachStepChannel, string> = {
  Email: "bg-blue-100 text-blue-700",
  SMS: "bg-green-100 text-green-700",
  Task: "bg-purple-100 text-purple-700",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface AudienceFilter {
  contactType: OutreachContactType;
  stages: string[];
  tags: string;
  companyId: string;
  assignedToClerkId: string;
  excludeOptout: boolean;
}

const EMPTY_FILTER: AudienceFilter = {
  contactType: "ReferralContacts",
  stages: [],
  tags: "",
  companyId: "",
  assignedToClerkId: "",
  excludeOptout: true,
};

interface StepFormState {
  channel: OutreachStepChannel;
  delayDays: number;
  delayHours: number;
  subjectOverride: string;
  bodyOverride: string;
  taskTitle: string;
  taskDescription: string;
  taskType: OutreachTaskType | "";
}

const EMPTY_STEP: StepFormState = {
  channel: "Email",
  delayDays: 1,
  delayHours: 0,
  subjectOverride: "",
  bodyOverride: "",
  taskTitle: "",
  taskDescription: "",
  taskType: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent";
const labelCls = "block text-xs font-medium text-gray-600 mb-1";

function formatDelay(days: number, hours: number) {
  if (days === 0 && hours === 0) return "Immediately";
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  return `+${parts.join(" ")}`;
}

// ─── Step Modal ───────────────────────────────────────────────────────────────

function StepModal({
  step,
  onSave,
  onClose,
}: {
  step: Partial<OutreachSequenceStep> & { id?: string };
  onSave: (data: StepFormState) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<StepFormState>({
    channel: step.channel ?? "Email",
    delayDays: step.delayDays ?? 1,
    delayHours: step.delayHours ?? 0,
    subjectOverride: step.subjectOverride ?? "",
    bodyOverride: step.bodyOverride ?? "",
    taskTitle: step.taskTitle ?? "",
    taskDescription: step.taskDescription ?? "",
    taskType: step.taskType ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="w-full sm:max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            {step.id ? "Edit Step" : "Add Step"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Channel */}
          <div>
            <label className={labelCls}>Channel</label>
            <div className="flex gap-3">
              {(["Email", "SMS", "Task"] as OutreachStepChannel[]).map(ch => (
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

          {/* Delay */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Delay (days)</label>
              <input
                type="number"
                min={0}
                value={form.delayDays}
                onChange={e => setForm(f => ({ ...f, delayDays: parseInt(e.target.value) || 0 }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Delay (hours)</label>
              <input
                type="number"
                min={0}
                max={23}
                value={form.delayHours}
                onChange={e => setForm(f => ({ ...f, delayHours: parseInt(e.target.value) || 0 }))}
                className={inputCls}
              />
            </div>
          </div>

          {form.channel !== "Task" && (
            <>
              {form.channel === "Email" && (
                <div>
                  <label className={labelCls}>Subject</label>
                  <input
                    type="text"
                    value={form.subjectOverride}
                    onChange={e => setForm(f => ({ ...f, subjectOverride: e.target.value }))}
                    className={inputCls}
                    placeholder="e.g. Following up on our conversation"
                  />
                </div>
              )}
              <div>
                <label className={labelCls}>Body</label>
                <textarea
                  value={form.bodyOverride}
                  onChange={e => setForm(f => ({ ...f, bodyOverride: e.target.value }))}
                  className={inputCls}
                  rows={6}
                  placeholder={form.channel === "Email"
                    ? "Hi {{first_name}},\n\nJust following up…"
                    : "Hi {{first_name}}, just checking in…"}
                />
                <p className="mt-1 text-xs text-gray-400">
                  Use: {"{{first_name}}"} {"{{last_name}}"} {"{{rep_first_name}}"} {"{{company}}"}
                </p>
              </div>
            </>
          )}

          {form.channel === "Task" && (
            <>
              <div>
                <label className={labelCls}>Task Type</label>
                <select
                  value={form.taskType}
                  onChange={e => setForm(f => ({ ...f, taskType: e.target.value as OutreachTaskType | "" }))}
                  className={inputCls}
                >
                  <option value="">Select type…</option>
                  {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Task Title</label>
                <input
                  type="text"
                  value={form.taskTitle}
                  onChange={e => setForm(f => ({ ...f, taskTitle: e.target.value }))}
                  className={inputCls}
                  placeholder="e.g. Send LinkedIn connection request"
                />
              </div>
              <div>
                <label className={labelCls}>Instructions (optional)</label>
                <textarea
                  value={form.taskDescription}
                  onChange={e => setForm(f => ({ ...f, taskDescription: e.target.value }))}
                  className={inputCls}
                  rows={3}
                  placeholder="Any notes for the rep completing this task…"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-forest-600 px-4 py-2 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : step.id ? "Save Changes" : "Add Step"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Enroll Modal ─────────────────────────────────────────────────────────────

function EnrollModal({
  sequenceId,
  companies,
  staffMembers,
  onClose,
  onEnrolled,
}: {
  sequenceId: string;
  companies: ReferralCompany[];
  staffMembers: StaffMember[];
  onClose: () => void;
  onEnrolled: (count: number) => void;
}) {
  const [filter, setFilter] = useState<AudienceFilter>(EMPTY_FILTER);
  const [preview, setPreview] = useState<{ count: number; sample: string[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [enrolling, setEnrolling] = useState(false);

  const stages = filter.contactType === "ReferralContacts" ? REFERRAL_STAGES : CLIENT_STAGES;

  async function fetchPreview() {
    setPreviewing(true);
    setPreview(null);
    try {
      const res = await fetch("/api/outreach/contacts-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter }),
      });
      const data = await res.json();
      setPreview(data);
    } finally {
      setPreviewing(false);
    }
  }

  async function handleEnroll() {
    setEnrolling(true);
    try {
      const res = await fetch(`/api/outreach/sequences/${sequenceId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter }),
      });
      const data = await res.json();
      if (res.ok) {
        onEnrolled(data.enrolled);
        onClose();
      }
    } finally {
      setEnrolling(false);
    }
  }

  function toggleStage(stage: string) {
    setFilter(f => ({
      ...f,
      stages: f.stages.includes(stage) ? f.stages.filter(s => s !== stage) : [...f.stages, stage],
    }));
    setPreview(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="w-full sm:max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Enroll Contacts</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Contact type */}
          <div>
            <label className={labelCls}>Contact group</label>
            <div className="flex gap-3">
              {(["ReferralContacts", "ClientContacts"] as OutreachContactType[]).map(ct => (
                <label key={ct} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="contactType"
                    value={ct}
                    checked={filter.contactType === ct}
                    onChange={() => { setFilter(f => ({ ...f, contactType: ct, stages: [] })); setPreview(null); }}
                    className="accent-forest-600"
                  />
                  <span className="text-sm text-gray-700">
                    {ct === "ReferralContacts" ? "Referral Partners" : "Clients"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Stages */}
          <div>
            <label className={labelCls}>Stage (leave empty for all)</label>
            <div className="flex flex-wrap gap-2">
              {stages.map(s => (
                <button
                  key={s}
                  onClick={() => toggleStage(s)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    filter.stages.includes(s)
                      ? "border-forest-500 bg-forest-50 text-forest-700"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Company */}
          <div>
            <label className={labelCls}>Company (optional)</label>
            <select
              value={filter.companyId}
              onChange={e => { setFilter(f => ({ ...f, companyId: e.target.value })); setPreview(null); }}
              className={inputCls}
            >
              <option value="">All companies</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className={labelCls}>Tags (comma-separated, optional)</label>
            <input
              type="text"
              value={filter.tags}
              onChange={e => { setFilter(f => ({ ...f, tags: e.target.value })); setPreview(null); }}
              className={inputCls}
              placeholder="e.g. vip, cold"
            />
          </div>

          {/* Assigned rep */}
          <div>
            <label className={labelCls}>Assigned rep (optional)</label>
            <select
              value={filter.assignedToClerkId}
              onChange={e => { setFilter(f => ({ ...f, assignedToClerkId: e.target.value })); setPreview(null); }}
              className={inputCls}
            >
              <option value="">All reps</option>
              {staffMembers.map(s => (
                <option key={s.clerkUserId} value={s.clerkUserId}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* Exclude optout */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filter.excludeOptout}
              onChange={e => { setFilter(f => ({ ...f, excludeOptout: e.target.checked })); setPreview(null); }}
              className="h-4 w-4 rounded border-gray-300 accent-forest-600"
            />
            <span className="text-sm text-gray-700">Exclude opted-out contacts</span>
          </label>

          {/* Preview */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-600">Audience preview</span>
              <button
                onClick={fetchPreview}
                disabled={previewing}
                className="text-xs text-forest-600 hover:text-forest-700 font-medium disabled:opacity-50"
              >
                {previewing ? "Checking…" : "Check count"}
              </button>
            </div>
            {preview ? (
              <div>
                <div className="text-lg font-bold text-gray-900">{preview.count} contacts</div>
                {preview.sample.length > 0 && (
                  <div className="mt-1 text-xs text-gray-400">
                    e.g. {preview.sample.slice(0, 3).join(", ")}
                    {preview.count > 3 && ` +${preview.count - 3} more`}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-400">Click &ldquo;Check count&rdquo; to preview</div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
            Cancel
          </button>
          <button
            onClick={handleEnroll}
            disabled={enrolling || !preview || preview.count === 0}
            className="rounded-lg bg-forest-600 px-4 py-2 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50"
          >
            {enrolling ? "Enrolling…" : `Enroll ${preview?.count ?? ""} contacts`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sequence Detail ──────────────────────────────────────────────────────────

function SequenceDetail({
  sequence,
  companies,
  staffMembers,
  onBack,
  onUpdated,
}: {
  sequence: OutreachSequence;
  companies: ReferralCompany[];
  staffMembers: StaffMember[];
  onBack: () => void;
  onUpdated: (s: OutreachSequence) => void;
}) {
  const [steps, setSteps] = useState<OutreachSequenceStep[]>([]);
  const [loadingSteps, setLoadingSteps] = useState(true);
  const [stepModal, setStepModal] = useState<Partial<OutreachSequenceStep> & { id?: string } | null>(null);
  const [deleteStepConfirm, setDeleteStepConfirm] = useState<string | null>(null);
  const [enrollModal, setEnrollModal] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState("");
  const [activating, setActivating] = useState(false);

  const loadSteps = useCallback(async () => {
    setLoadingSteps(true);
    try {
      const res = await fetch(`/api/outreach/sequences/${sequence.id}/steps`);
      const data = await res.json();
      setSteps((data.steps ?? []).sort((a: OutreachSequenceStep, b: OutreachSequenceStep) => a.stepOrder - b.stepOrder));
    } finally {
      setLoadingSteps(false);
    }
  }, [sequence.id]);

  useEffect(() => { loadSteps(); }, [loadSteps]);

  async function handleSaveStep(form: StepFormState) {
    if (stepModal?.id) {
      const res = await fetch(`/api/outreach/sequences/${sequence.id}/steps`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: stepModal.id, ...form }),
      });
      const data = await res.json();
      setSteps(prev => prev.map(s => s.id === stepModal.id ? data.step : s).sort((a, b) => a.stepOrder - b.stepOrder));
    } else {
      const nextOrder = steps.length > 0 ? Math.max(...steps.map(s => s.stepOrder)) + 1 : 1;
      const res = await fetch(`/api/outreach/sequences/${sequence.id}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, stepOrder: nextOrder }),
      });
      const data = await res.json();
      setSteps(prev => [...prev, data.step].sort((a, b) => a.stepOrder - b.stepOrder));
    }
    setStepModal(null);
  }

  async function handleDeleteStep(id: string) {
    await fetch(`/api/outreach/sequences/${sequence.id}/steps?stepId=${id}`, { method: "DELETE" });
    setSteps(prev => prev.filter(s => s.id !== id));
    setDeleteStepConfirm(null);
  }

  async function handleToggleActive() {
    setActivating(true);
    const newStatus: OutreachSequenceStatus = sequence.status === "Active" ? "Draft" : "Active";
    const res = await fetch(`/api/outreach/sequences/${sequence.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    onUpdated(data.sequence);
    setActivating(false);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start gap-3">
        <button
          onClick={onBack}
          className="mt-0.5 text-gray-400 hover:text-gray-700 transition-colors"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-gray-900">{sequence.name}</h2>
            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", STATUS_COLORS[sequence.status])}>
              {sequence.status}
            </span>
          </div>
          {sequence.description && (
            <p className="mt-0.5 text-sm text-gray-500">{sequence.description}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setEnrollModal(true)}
            className="rounded-lg border border-forest-600 px-3 py-1.5 text-sm font-medium text-forest-700 hover:bg-forest-50 transition-colors"
          >
            Enroll Contacts
          </button>
          <button
            onClick={handleToggleActive}
            disabled={activating || steps.length === 0}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
              sequence.status === "Active"
                ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                : "bg-forest-600 text-white hover:bg-forest-700"
            )}
          >
            {sequence.status === "Active" ? "Pause" : "Activate"}
          </button>
        </div>
      </div>

      {/* Steps */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Steps ({steps.length})</h3>
        <button
          onClick={() => setStepModal({})}
          className="rounded-lg bg-forest-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-forest-700 transition-colors"
        >
          + Add Step
        </button>
      </div>

      {loadingSteps ? (
        <div className="py-10 text-center text-sm text-gray-400">Loading steps…</div>
      ) : steps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center">
          <p className="text-sm text-gray-500 mb-3">No steps yet. Add your first step to build the cadence.</p>
          <button
            onClick={() => setStepModal({})}
            className="text-sm text-forest-600 hover:text-forest-700 font-medium"
          >
            Add step →
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {steps.map((step, idx) => (
            <div key={step.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">
                {idx + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", CHANNEL_COLORS[step.channel])}>
                    {step.channel}
                  </span>
                  <span className="text-xs text-gray-400">{formatDelay(step.delayDays, step.delayHours)}</span>
                </div>
                <div className="mt-0.5 text-sm text-gray-700 truncate">
                  {step.channel === "Task"
                    ? step.taskTitle || <span className="text-gray-400 italic">No title</span>
                    : step.subjectOverride || <span className="text-gray-400 italic">No subject</span>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setStepModal(step)}
                  className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeleteStepConfirm(step.id)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {enrollMsg && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {enrollMsg}
        </div>
      )}

      {/* Modals */}
      {stepModal !== null && (
        <StepModal
          step={stepModal}
          onSave={handleSaveStep}
          onClose={() => setStepModal(null)}
        />
      )}

      {deleteStepConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete step?</h3>
            <p className="text-sm text-gray-500 mb-6">This can&apos;t be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteStepConfirm(null)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Cancel</button>
              <button onClick={() => handleDeleteStep(deleteStepConfirm)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      {enrollModal && (
        <EnrollModal
          sequenceId={sequence.id}
          companies={companies}
          staffMembers={staffMembers}
          onClose={() => setEnrollModal(false)}
          onEnrolled={(count) => {
            setEnrollMsg(`Enrolled ${count} contact${count !== 1 ? "s" : ""} into this sequence.`);
            setTimeout(() => setEnrollMsg(""), 5000);
          }}
        />
      )}
    </div>
  );
}

// ─── Sequences list ───────────────────────────────────────────────────────────

function SequencesList({
  sequences,
  loading,
  onNew,
  onSelect,
}: {
  sequences: OutreachSequence[];
  loading: boolean;
  onNew: () => void;
  onSelect: (s: OutreachSequence) => void;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">Multi-step cadences that auto-pause on reply.</p>
        <button
          onClick={onNew}
          className="rounded-lg bg-forest-600 px-4 py-2 text-sm font-medium text-white hover:bg-forest-700 transition-colors"
        >
          + New Sequence
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
      ) : sequences.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center">
          <p className="text-sm text-gray-500">No sequences yet.</p>
          <button onClick={onNew} className="mt-3 text-sm text-forest-600 hover:text-forest-700 font-medium">
            Create your first sequence →
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 hidden sm:table-cell">Description</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {sequences.map(seq => (
                <tr key={seq.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => onSelect(seq)}>
                  <td className="px-4 py-3 font-medium text-gray-900">{seq.name}</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", STATUS_COLORS[seq.status])}>
                      {seq.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-gray-400 max-w-xs truncate">
                    {seq.description || "—"}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => onSelect(seq)}
                      className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
                    >
                      Open →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Create modal ─────────────────────────────────────────────────────────────

function CreateSequenceModal({
  onSave,
  onClose,
}: {
  onSave: (name: string, description: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try { await onSave(name.trim(), description.trim()); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">New Sequence</h2>
        <div className="space-y-3 mb-6">
          <div>
            <label className={labelCls}>Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              className={inputCls}
              placeholder="e.g. New Referral Partner Intro"
              onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
            />
          </div>
          <div>
            <label className={labelCls}>Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className={inputCls}
              placeholder="What is this sequence for?"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="rounded-lg bg-forest-600 px-4 py-2 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default function SequencesTab({
  companies,
  staffMembers,
}: {
  companies: ReferralCompany[];
  staffMembers: StaffMember[];
}) {
  const [sequences, setSequences] = useState<OutreachSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OutreachSequence | null>(null);
  const [createModal, setCreateModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/outreach/sequences");
      const data = await res.json();
      setSequences(data.sequences ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(name: string, description: string) {
    const res = await fetch("/api/outreach/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    const data = await res.json();
    const seq: OutreachSequence = data.sequence;
    setSequences(prev => [seq, ...prev]);
    setCreateModal(false);
    setSelected(seq);
  }

  function handleUpdated(updated: OutreachSequence) {
    setSequences(prev => prev.map(s => s.id === updated.id ? updated : s));
    setSelected(updated);
  }

  if (selected) {
    return (
      <SequenceDetail
        sequence={selected}
        companies={companies}
        staffMembers={staffMembers}
        onBack={() => setSelected(null)}
        onUpdated={handleUpdated}
      />
    );
  }

  return (
    <>
      <SequencesList
        sequences={sequences}
        loading={loading}
        onNew={() => setCreateModal(true)}
        onSelect={setSelected}
      />
      {createModal && (
        <CreateSequenceModal onSave={handleCreate} onClose={() => setCreateModal(false)} />
      )}
    </>
  );
}
