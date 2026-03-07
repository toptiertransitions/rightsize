"use client";

import { useState, useMemo } from "react";
import type {
  DripCampaign,
  DripEnrollment,
  DripSettings,
  ReferralContact,
  ReferralCompany,
  ClientContact,
  EnrollmentStatus,
} from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function isDue(enrollment: DripEnrollment, campaign: DripCampaign): boolean {
  const step = campaign.steps[enrollment.currentStep];
  if (!step) return false;
  const enrolledDays = daysSince(enrollment.enrolledAt);
  return enrolledDays >= step.dayOffset;
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_COLORS: Record<EnrollmentStatus, string> = {
  Active: "bg-green-900/40 text-green-400",
  Paused: "bg-amber-900/40 text-amber-400",
  Completed: "bg-blue-900/40 text-blue-400",
  Unsubscribed: "bg-gray-700 text-gray-400",
};

// ─── Enroll Modal ─────────────────────────────────────────────────────────────
function EnrollModal({
  campaigns,
  referralContacts,
  referralCompanies,
  clientContacts,
  onClose,
  onEnrolled,
}: {
  campaigns: DripCampaign[];
  referralContacts: ReferralContact[];
  referralCompanies: ReferralCompany[];
  clientContacts: ClientContact[];
  onClose: () => void;
  onEnrolled: (enrollment: DripEnrollment) => void;
}) {
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id || "");
  const [contactType, setContactType] = useState<"referral" | "client">("referral");
  const [contactId, setContactId] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [customName, setCustomName] = useState("");
  const [customCompany, setCustomCompany] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedCampaign = campaigns.find((c) => c.id === campaignId);
  const contacts = contactType === "referral" ? referralContacts : clientContacts;
  const selectedContact = contacts.find((c) => c.id === contactId);

  const handleSubmit = async () => {
    const email = useCustom ? customEmail : selectedContact?.email || "";
    const name = useCustom ? customName : selectedContact?.name || "";

    if (!campaignId || !email) { setError("Campaign and email are required."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/drip/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          campaignName: selectedCampaign?.name || "",
          contactType,
          contactId: useCustom ? "" : (contactId || ""),
          contactEmail: email,
          contactName: name,
          company: useCustom
            ? customCompany
            : contactType === "referral" && selectedContact
              ? referralCompanies.find((c) => c.id === (selectedContact as ReferralContact).referralCompanyId)?.name || ""
              : "",
        }),
      });
      if (!res.ok) { setError("Failed to enroll contact."); return; }
      const { enrollment } = await res.json();
      onEnrolled(enrollment);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Enroll Contact</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {/* Campaign */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Campaign</label>
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
            >
              {campaigns.filter((c) => c.isActive).map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.steps.length} steps)</option>
              ))}
            </select>
          </div>

          {/* Contact source toggle */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Contact</label>
            <div className="flex gap-2 mb-3">
              {(["referral", "client", "custom"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { if (t === "custom") { setUseCustom(true); } else { setUseCustom(false); setContactType(t); } }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    (t === "custom" ? useCustom : !useCustom && contactType === t)
                      ? "bg-forest-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {t === "referral" ? "Referral Partner" : t === "client" ? "Client" : "Custom Email"}
                </button>
              ))}
            </div>

            {useCustom ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Full name"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                />
                <input
                  type="email"
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  placeholder="Email address"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                />
                <input
                  type="text"
                  value={customCompany}
                  onChange={(e) => setCustomCompany(e.target.value)}
                  placeholder="Company (optional)"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                />
              </div>
            ) : (
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              >
                <option value="">Select a contact...</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.email}</option>
                ))}
              </select>
            )}
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="text-sm bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl font-semibold transition-colors"
          >
            {saving ? "Enrolling..." : "Enroll"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mass Email Modal ─────────────────────────────────────────────────────────
function MassEmailModal({
  referralContacts,
  clientContacts,
  settings,
  userEmail,
  userFullName,
  onClose,
}: {
  referralContacts: ReferralContact[];
  clientContacts: ClientContact[];
  settings: DripSettings | null;
  userEmail: string;
  userFullName: string;
  onClose: () => void;
}) {
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [audienceFilter, setAudienceFilter] = useState<"referral" | "client" | "all">("all");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [senderName, setSenderName] = useState(userFullName || settings?.senderName || "");
  const [senderEmail, setSenderEmail] = useState(userEmail || settings?.senderEmail || "");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);

  const allContacts = useMemo(() => {
    const refs = referralContacts.filter((c) => c.email).map((c) => ({ ...c, type: "referral" as const }));
    const clients = clientContacts.filter((c) => c.email).map((c) => ({ ...c, company: "", type: "client" as const }));
    if (audienceFilter === "referral") return refs;
    if (audienceFilter === "client") return clients;
    return [...refs, ...clients];
  }, [referralContacts, clientContacts, audienceFilter]);

  const toggleAll = () => {
    if (selectedEmails.size === allContacts.length) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(allContacts.map((c) => c.email)));
    }
  };

  const toggleContact = (email: string) => {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  };

  const handleSend = async () => {
    if (!subject || !body || selectedEmails.size === 0) return;
    setSending(true);
    try {
      const recipients = allContacts
        .filter((c) => selectedEmails.has(c.email))
        .map((c) => ({ email: c.email, name: c.name, company: (c as ReferralContact).referralCompanyId ? "" : "" }));

      const res = await fetch("/api/drip/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "mass", recipients, subject, bodyHtml: body, senderName, senderEmail }),
      });
      if (res.ok) {
        setResult(await res.json());
      }
    } finally {
      setSending(false);
    }
  };

  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-8 text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">Emails Sent</h3>
          <p className="text-gray-500 text-sm mb-1">{result.sent} sent successfully</p>
          {result.failed > 0 && <p className="text-red-500 text-sm">{result.failed} failed</p>}
          <button onClick={onClose} className="mt-6 bg-forest-600 text-white px-6 py-2.5 rounded-xl font-semibold text-sm">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 overflow-y-auto pt-8 pb-8">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Send Mass Email</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-5">
          {/* Sender */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">From Name</label>
              <input
                type="text"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">From Email</label>
              <input
                type="email"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              />
            </div>
          </div>

          {/* Subject + Body */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Subject Line</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. A quick note from {{sender_name}}"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email Body</label>
            <p className="text-[11px] text-gray-400 mb-1.5">
              Variables: {"{{first_name}} {{full_name}} {{company}} {{sender_name}}"}
            </p>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="Write your email body here..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 resize-y"
            />
          </div>

          {/* Recipients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500">Recipients ({selectedEmails.size} selected)</label>
              <div className="flex gap-1">
                {(["all", "referral", "client"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => { setAudienceFilter(f); setSelectedEmails(new Set()); }}
                    className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                      audienceFilter === f ? "bg-forest-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {f === "all" ? "All" : f === "referral" ? "Partners" : "Clients"}
                  </button>
                ))}
              </div>
            </div>
            <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
              <div
                className="flex items-center gap-3 px-3 py-2 bg-gray-50 border-b border-gray-200 cursor-pointer"
                onClick={toggleAll}
              >
                <input
                  type="checkbox"
                  readOnly
                  checked={selectedEmails.size === allContacts.length && allContacts.length > 0}
                  className="rounded"
                />
                <span className="text-xs font-medium text-gray-600">Select all ({allContacts.length})</span>
              </div>
              {allContacts.map((c) => (
                <div
                  key={c.email}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                  onClick={() => toggleContact(c.email)}
                >
                  <input type="checkbox" readOnly checked={selectedEmails.has(c.email)} className="rounded" />
                  <span className="text-sm text-gray-800">{c.name}</span>
                  <span className="text-xs text-gray-400 ml-auto">{c.email}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.type === "referral" ? "bg-purple-100 text-purple-600" : "bg-blue-100 text-blue-600"}`}>
                    {c.type === "referral" ? "Partner" : "Client"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <span className="text-xs text-gray-400">CAN-SPAM compliant · Unsubscribe link included</span>
          <div className="flex gap-3">
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !subject || !body || selectedEmails.size === 0}
              className="text-sm bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl font-semibold transition-colors"
            >
              {sending ? `Sending to ${selectedEmails.size}...` : `Send to ${selectedEmails.size} contact${selectedEmails.size !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  campaigns: DripCampaign[];
  initialEnrollments: DripEnrollment[];
  settings: DripSettings | null;
  referralContacts: ReferralContact[];
  referralCompanies: ReferralCompany[];
  clientContacts: ClientContact[];
  userEmail: string;
  userFullName: string;
}

type DripTab = "queue" | "campaigns" | "enrollments" | "mass";

// ─── Main ─────────────────────────────────────────────────────────────────────
export function DripClient({
  campaigns,
  initialEnrollments,
  settings,
  referralContacts,
  referralCompanies,
  clientContacts,
  userEmail,
  userFullName,
}: Props) {
  const [tab, setTab] = useState<DripTab>("queue");
  const [enrollments, setEnrollments] = useState<DripEnrollment[]>(initialEnrollments);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [showMassModal, setShowMassModal] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<EnrollmentStatus | "All">("All");

  const campaignMap = useMemo(
    () => new Map(campaigns.map((c) => [c.id, c])),
    [campaigns]
  );

  // Queue: active enrollments with a due step
  const queue = useMemo(
    () =>
      enrollments
        .filter((e) => {
          if (e.status !== "Active") return false;
          const campaign = campaignMap.get(e.campaignId);
          if (!campaign) return false;
          return isDue(e, campaign);
        })
        .sort((a, b) => new Date(a.enrolledAt).getTime() - new Date(b.enrolledAt).getTime()),
    [enrollments, campaignMap]
  );

  const filteredEnrollments = useMemo(
    () =>
      statusFilter === "All"
        ? enrollments
        : enrollments.filter((e) => e.status === statusFilter),
    [enrollments, statusFilter]
  );

  // ── Send single step ───────────────────────────────────────────────────────
  const sendStep = async (enrollment: DripEnrollment) => {
    const campaign = campaignMap.get(enrollment.campaignId);
    if (!campaign) return;
    setSending(enrollment.id);
    try {
      const res = await fetch("/api/drip/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enrollmentId: enrollment.id,
          stepIndex: enrollment.currentStep,
          senderName: userFullName || settings?.senderName || "Top Tier Transitions",
          senderEmail: userEmail || settings?.senderEmail || "",
        }),
      });
      if (res.ok) {
        const { enrollment: updated } = await res.json();
        setEnrollments((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      }
    } finally {
      setSending(null);
    }
  };

  // ── Skip step ─────────────────────────────────────────────────────────────
  const skipStep = async (enrollment: DripEnrollment) => {
    const campaign = campaignMap.get(enrollment.campaignId);
    const nextStep = enrollment.currentStep + 1;
    const isComplete = campaign ? nextStep >= campaign.steps.length : false;
    const res = await fetch("/api/drip/enrollments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: enrollment.id,
        currentStep: nextStep,
        ...(isComplete ? { status: "Completed" } : {}),
      }),
    });
    if (res.ok) {
      const { enrollment: updated } = await res.json();
      setEnrollments((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    }
  };

  // ── Update status ──────────────────────────────────────────────────────────
  const updateStatus = async (enrollment: DripEnrollment, status: EnrollmentStatus) => {
    const res = await fetch("/api/drip/enrollments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: enrollment.id, status }),
    });
    if (res.ok) {
      const { enrollment: updated } = await res.json();
      setEnrollments((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    }
  };

  // ── Delete enrollment ──────────────────────────────────────────────────────
  const deleteEnrollment = async (id: string) => {
    const res = await fetch(`/api/drip/enrollments?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setEnrollments((prev) => prev.filter((e) => e.id !== id));
    }
  };

  const TABS: { key: DripTab; label: string; count?: number }[] = [
    { key: "queue", label: "Queue", count: queue.length },
    { key: "campaigns", label: "Campaigns", count: campaigns.length },
    { key: "enrollments", label: "Enrollments", count: enrollments.length },
    { key: "mass", label: "Mass Email" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Drip Campaigns</h1>
              <p className="text-sm text-gray-500 mt-0.5">Automated email sequences for referral partners and clients</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowMassModal(true)}
                className="text-sm border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-xl transition-colors font-medium"
              >
                Send Mass Email
              </button>
              <button
                onClick={() => setShowEnrollModal(true)}
                className="text-sm bg-forest-600 hover:bg-forest-700 text-white px-4 py-2 rounded-xl transition-colors font-semibold"
              >
                + Enroll Contact
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "bg-forest-50 text-forest-700"
                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                }`}
              >
                {t.label}
                {t.count !== undefined && (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                      tab === t.key ? "bg-forest-100 text-forest-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* ── Queue Tab ─────────────────────────────────────────────────── */}
        {tab === "queue" && (
          <div>
            {queue.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <div className="text-4xl mb-3">📬</div>
                <p className="font-medium">Queue is empty</p>
                <p className="text-sm mt-1">No emails are due today. Check back tomorrow or enroll new contacts.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {queue.map((enrollment) => {
                  const campaign = campaignMap.get(enrollment.campaignId);
                  const step = campaign?.steps[enrollment.currentStep];
                  if (!step) return null;
                  return (
                    <div key={enrollment.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-forest-600 bg-forest-50 px-2 py-0.5 rounded-full">
                              Step {enrollment.currentStep + 1} of {campaign?.steps.length}
                            </span>
                            <span className="text-xs text-gray-400">{campaign?.name}</span>
                          </div>
                          <div className="font-semibold text-gray-900 text-sm">{enrollment.contactName}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{enrollment.contactEmail}</div>
                          <div className="mt-2 bg-gray-50 rounded-lg px-3 py-2">
                            <div className="text-xs font-semibold text-gray-700">{step.subject}</div>
                            <div className="text-xs text-gray-400 mt-0.5 truncate">{step.previewText}</div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          <button
                            onClick={() => sendStep(enrollment)}
                            disabled={sending === enrollment.id}
                            className="text-sm bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-semibold transition-colors whitespace-nowrap"
                          >
                            {sending === enrollment.id ? "Sending..." : "Send Now"}
                          </button>
                          <button
                            onClick={() => skipStep(enrollment)}
                            className="text-sm text-gray-400 hover:text-gray-600 px-4 py-1.5 rounded-xl hover:bg-gray-50 transition-colors"
                          >
                            Skip
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Campaigns Tab ─────────────────────────────────────────────── */}
        {tab === "campaigns" && (
          <div>
            {campaigns.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <p className="font-medium">No campaigns configured</p>
                <p className="text-sm mt-1">An admin can create campaigns in the Admin portal under Drips.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {campaigns.map((c) => {
                  const active = enrollments.filter((e) => e.campaignId === c.id && e.status === "Active").length;
                  return (
                    <div
                      key={c.id}
                      className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-900 text-sm leading-tight">{c.name}</div>
                          {c.description && (
                            <div className="text-xs text-gray-400 mt-1 leading-relaxed">{c.description}</div>
                          )}
                        </div>
                        <span
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${
                            c.isActive ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"
                          }`}
                        >
                          {c.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400 mb-4">
                        <span>{c.steps.length} steps</span>
                        <span>·</span>
                        <span>{c.audience}</span>
                        <span>·</span>
                        <span>{active} active</span>
                      </div>
                      <div className="mt-auto space-y-1.5">
                        {c.steps.slice(0, 3).map((s, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                            <span className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
                              {i + 1}
                            </span>
                            <span className="truncate">{s.subject}</span>
                          </div>
                        ))}
                        {c.steps.length > 3 && (
                          <div className="text-xs text-gray-400 pl-7">+{c.steps.length - 3} more steps</div>
                        )}
                      </div>
                      <button
                        onClick={() => setShowEnrollModal(true)}
                        disabled={!c.isActive}
                        className="mt-4 w-full text-xs bg-forest-50 hover:bg-forest-100 disabled:opacity-40 text-forest-700 px-3 py-2 rounded-xl font-medium transition-colors"
                      >
                        Enroll a Contact
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Enrollments Tab ───────────────────────────────────────────── */}
        {tab === "enrollments" && (
          <div>
            <div className="flex items-center gap-2 mb-5">
              {(["All", "Active", "Paused", "Completed", "Unsubscribed"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    statusFilter === s
                      ? "bg-forest-600 text-white"
                      : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {filteredEnrollments.length === 0 ? (
              <div className="text-center py-16 text-gray-400">No enrollments found.</div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Contact</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Campaign</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Progress</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Last Sent</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEnrollments.map((e) => {
                      const campaign = campaignMap.get(e.campaignId);
                      return (
                        <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{e.contactName || "—"}</div>
                            <div className="text-xs text-gray-400">{e.contactEmail}</div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{e.campaignName}</td>
                          <td className="px-4 py-3">
                            <div className="text-xs text-gray-500">
                              Step {e.currentStep} of {campaign?.steps.length || "?"}
                            </div>
                            <div className="mt-1 h-1 bg-gray-100 rounded-full w-20">
                              <div
                                className="h-1 bg-forest-500 rounded-full"
                                style={{ width: `${campaign ? (e.currentStep / campaign.steps.length) * 100 : 0}%` }}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[e.status]}`}>
                              {e.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(e.lastSentAt)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {e.status === "Active" && (
                                <button
                                  onClick={() => updateStatus(e, "Paused")}
                                  className="text-xs text-gray-400 hover:text-amber-500 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                                >
                                  Pause
                                </button>
                              )}
                              {e.status === "Paused" && (
                                <button
                                  onClick={() => updateStatus(e, "Active")}
                                  className="text-xs text-gray-400 hover:text-green-500 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                                >
                                  Resume
                                </button>
                              )}
                              <button
                                onClick={() => deleteEnrollment(e.id)}
                                className="text-xs text-gray-300 hover:text-red-400 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Mass Email Tab ─────────────────────────────────────────────── */}
        {tab === "mass" && (
          <div className="text-center py-20">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 bg-forest-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Send a Mass Email</h2>
              <p className="text-sm text-gray-500 mb-6">
                Compose a one-time email blast to any combination of referral partners and client contacts.
                All emails include your branding and a CAN-SPAM compliant unsubscribe link.
              </p>
              <button
                onClick={() => setShowMassModal(true)}
                className="bg-forest-600 hover:bg-forest-700 text-white px-6 py-3 rounded-xl font-semibold text-sm transition-colors"
              >
                Compose Mass Email
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showEnrollModal && (
        <EnrollModal
          campaigns={campaigns}
          referralContacts={referralContacts}
          referralCompanies={referralCompanies}
          clientContacts={clientContacts}
          onClose={() => setShowEnrollModal(false)}
          onEnrolled={(e) => setEnrollments((prev) => [e, ...prev])}
        />
      )}
      {showMassModal && (
        <MassEmailModal
          referralContacts={referralContacts}
          clientContacts={clientContacts}
          settings={settings}
          userEmail={userEmail}
          userFullName={userFullName}
          onClose={() => setShowMassModal(false)}
        />
      )}
    </div>
  );
}
