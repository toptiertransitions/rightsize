"use client";

import { useState, useRef, useCallback, useEffect } from "react";
// Inline SVG icon components — no icon library dependency
function IconMic({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
}
function IconStop({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>;
}
function IconTrash({ size = 15 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
}
function IconChevronDown({ size = 15 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;
}
function IconChevronUp({ size = 15 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>;
}
function IconSpinner({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>;
}
function IconCheck({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
}
function IconAlert({ size = 12 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
}
import { cn } from "@/lib/utils";
import type { ReferralCompany, ReferralContact, CRMActivityType, ReferralContactStage } from "@/lib/types";

// ─── Local types ──────────────────────────────────────────────────────────────

interface ParsedActivity {
  _id: string;
  contactId: string | null;
  contactName: string;
  companyName: string;
  type: CRMActivityType;
  date: string;
  notes: string;
}

interface ParsedNextStep {
  _id: string;
  contactId: string | null;
  contactName: string;
  companyName: string;
  nextStepDate: string;
  nextStepNote: string;
}

interface ParsedClientLead {
  _id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  notes: string;
  _saving: boolean;
  _saved: boolean;
  _error: string | null;
}

interface ParsedRefContact {
  _id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  companyName: string;
  companyId: string | null;
  notes: string;
  stage: ReferralContactStage;
  _saving: boolean;
  _saved: boolean;
  _error: string | null;
  _creatingCompany: boolean;
}

type RecordingState = "idle" | "recording" | "processing" | "results" | "error";

const ACTIVITY_TYPES: CRMActivityType[] = ["Call", "Email", "Meeting", "Note", "Task", "Text Message"];

function uid() { return Math.random().toString(36).slice(2, 9); }

// ─── Contact typeahead ────────────────────────────────────────────────────────

function ContactTypeahead({
  value, onChange, onIdChange, referralContacts, companies, placeholder,
}: {
  value: string;
  onChange: (name: string) => void;
  onIdChange: (id: string | null) => void;
  referralContacts: ReferralContact[];
  companies: ReferralCompany[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const companyMap = new Map(companies.map(c => [c.id, c.name]));
  const lower = value.toLowerCase();
  const filtered = lower.length > 0
    ? referralContacts.filter(c =>
        c.name.toLowerCase().includes(lower) ||
        (companyMap.get(c.referralCompanyId) ?? "").toLowerCase().includes(lower)
      ).slice(0, 8)
    : [];

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); onIdChange(null); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder ?? "Search contacts…"}
        className="w-full h-8 px-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-forest-500"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
              onMouseDown={() => {
                onChange(c.name);
                onIdChange(c.id);
                setOpen(false);
              }}
            >
              <span className="font-medium text-gray-900">{c.name}</span>
              <span className="ml-2 text-xs text-gray-400">{companyMap.get(c.referralCompanyId) ?? ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Activity card ────────────────────────────────────────────────────────────

function ActivityCard({
  act, referralContacts, companies, onChange, onDelete,
}: {
  act: ParsedActivity;
  referralContacts: ReferralContact[];
  companies: ReferralCompany[];
  onChange: (a: ParsedActivity) => void;
  onDelete: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex gap-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Contact</label>
            <ContactTypeahead
              value={act.contactName}
              onChange={name => onChange({ ...act, contactName: name })}
              onIdChange={id => onChange({ ...act, contactId: id })}
              referralContacts={referralContacts}
              companies={companies}
            />
            {act.contactName && !act.contactId && (
              <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                <IconAlert size={11} /> Not matched — check spelling
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Company</label>
            <input
              type="text"
              value={act.companyName}
              onChange={e => onChange({ ...act, companyName: e.target.value })}
              placeholder="Company"
              className="w-full h-8 px-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-forest-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Activity Type</label>
            <select
              value={act.type}
              onChange={e => onChange({ ...act, type: e.target.value as CRMActivityType })}
              className="w-full h-8 px-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-forest-500 bg-white"
            >
              {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={act.date || today}
              onChange={e => onChange({ ...act, date: e.target.value })}
              className="w-full h-8 px-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-forest-500"
            />
          </div>
        </div>
        <button onClick={onDelete} className="text-gray-300 hover:text-red-500 transition-colors mt-1 shrink-0">
          <IconTrash size={15} />
        </button>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
        <textarea
          value={act.notes}
          onChange={e => onChange({ ...act, notes: e.target.value })}
          rows={2}
          className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-forest-500 resize-none"
          placeholder="Notes about this interaction…"
        />
      </div>
    </div>
  );
}

// ─── Next step card ───────────────────────────────────────────────────────────

function NextStepCard({
  step, referralContacts, companies, onChange, onDelete,
}: {
  step: ParsedNextStep;
  referralContacts: ReferralContact[];
  companies: ReferralCompany[];
  onChange: (s: ParsedNextStep) => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex gap-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Contact <span className="text-amber-500">*</span></label>
            <ContactTypeahead
              value={step.contactName}
              onChange={name => onChange({ ...step, contactName: name })}
              onIdChange={id => onChange({ ...step, contactId: id })}
              referralContacts={referralContacts}
              companies={companies}
            />
            {!step.contactId && (
              <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                <IconAlert size={11} /> Required to save next step
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Next Step Date</label>
            <input
              type="date"
              value={step.nextStepDate}
              onChange={e => onChange({ ...step, nextStepDate: e.target.value })}
              className="w-full h-8 px-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-forest-500"
            />
          </div>
        </div>
        <button onClick={onDelete} className="text-gray-300 hover:text-red-500 transition-colors mt-1 shrink-0">
          <IconTrash size={15} />
        </button>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Next Step Note</label>
        <textarea
          value={step.nextStepNote}
          onChange={e => onChange({ ...step, nextStepNote: e.target.value })}
          rows={2}
          className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-forest-500 resize-none"
          placeholder="What needs to happen…"
        />
      </div>
    </div>
  );
}

// ─── Client lead card ─────────────────────────────────────────────────────────

function ClientLeadCard({
  lead, onChange, onDelete, onSave,
}: {
  lead: ParsedClientLead;
  onChange: (l: ParsedClientLead) => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  const missingRequired = !lead.name.trim();
  const missingContact = !lead.email.trim() && !lead.phone.trim();

  return (
    <div className={cn("bg-white rounded-xl border p-4 space-y-3", lead._saved ? "border-green-300 bg-green-50/30" : "border-gray-200")}>
      {lead._saved ? (
        <p className="text-sm text-green-700 flex items-center gap-2 font-medium"><IconCheck size={15} /> Created successfully</p>
      ) : (
        <>
          <div className="flex gap-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Full Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={lead.name}
                  onChange={e => onChange({ ...lead, name: e.target.value })}
                  placeholder="Required — please fill in"
                  className={cn("w-full h-8 px-2.5 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-forest-500", missingRequired ? "border-amber-400 bg-amber-50" : "border-gray-300")}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Phone {missingContact && <span className="text-amber-500">*</span>}</label>
                <input
                  type="tel"
                  value={lead.phone}
                  onChange={e => onChange({ ...lead, phone: e.target.value })}
                  placeholder="Phone number"
                  className={cn("w-full h-8 px-2.5 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-forest-500", missingContact ? "border-amber-400 bg-amber-50" : "border-gray-300")}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email {missingContact && <span className="text-amber-500">*</span>}</label>
                <input
                  type="email"
                  value={lead.email}
                  onChange={e => onChange({ ...lead, email: e.target.value })}
                  placeholder="Email address"
                  className={cn("w-full h-8 px-2.5 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-forest-500", missingContact ? "border-amber-400 bg-amber-50" : "border-gray-300")}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
                <input
                  type="text"
                  value={lead.source}
                  onChange={e => onChange({ ...lead, source: e.target.value })}
                  placeholder="How were they referred?"
                  className="w-full h-8 px-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-forest-500"
                />
              </div>
            </div>
            <button onClick={onDelete} className="text-gray-300 hover:text-red-500 transition-colors mt-1 shrink-0">
              <IconTrash size={15} />
            </button>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea
              value={lead.notes}
              onChange={e => onChange({ ...lead, notes: e.target.value })}
              rows={2}
              className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-forest-500 resize-none"
              placeholder="Context…"
            />
          </div>
          {missingContact && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <IconAlert size={11} /> Phone or Email required
            </p>
          )}
          {lead._error && <p className="text-xs text-red-500">{lead._error}</p>}
          <div className="flex justify-end">
            <button
              onClick={onSave}
              disabled={lead._saving || missingRequired || missingContact}
              className="h-8 px-4 bg-forest-600 text-white text-sm font-medium rounded-lg hover:bg-forest-700 disabled:opacity-40 transition-colors flex items-center gap-2"
            >
              {lead._saving && <IconSpinner size={13} />}
              {lead._saving ? "Creating…" : "Create Client"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Referral contact card ────────────────────────────────────────────────────

function RefContactCard({
  contact, companies, onChange, onDelete, onSave, onCreateCompany,
}: {
  contact: ParsedRefContact;
  companies: ReferralCompany[];
  onChange: (c: ParsedRefContact) => void;
  onDelete: () => void;
  onSave: () => void;
  onCreateCompany: () => void;
}) {
  const missingRequired = !contact.name.trim() || (!contact.companyId && !contact.companyName.trim());

  return (
    <div className={cn("bg-white rounded-xl border p-4 space-y-3", contact._saved ? "border-green-300 bg-green-50/30" : "border-gray-200")}>
      {contact._saved ? (
        <p className="text-sm text-green-700 flex items-center gap-2 font-medium"><IconCheck size={15} /> Added to CRM</p>
      ) : (
        <>
          <div className="flex gap-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Full Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={contact.name}
                  onChange={e => onChange({ ...contact, name: e.target.value })}
                  placeholder="Required"
                  className={cn("w-full h-8 px-2.5 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-forest-500", !contact.name.trim() ? "border-amber-400 bg-amber-50" : "border-gray-300")}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
                <input
                  type="text"
                  value={contact.title}
                  onChange={e => onChange({ ...contact, title: e.target.value })}
                  placeholder="Job title"
                  className="w-full h-8 px-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-forest-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Company <span className="text-red-500">*</span></label>
                <select
                  value={contact.companyId ?? ""}
                  onChange={e => {
                    const c = companies.find(x => x.id === e.target.value);
                    onChange({ ...contact, companyId: e.target.value || null, companyName: c?.name ?? contact.companyName });
                  }}
                  className={cn("w-full h-8 px-2.5 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-forest-500 bg-white", !contact.companyId ? "border-amber-400 bg-amber-50" : "border-gray-300")}
                >
                  <option value="">-- Select company --</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {!contact.companyId && contact.companyName && (
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <IconAlert size={11} /> "{contact.companyName}" not found
                    </p>
                    <button
                      onClick={onCreateCompany}
                      disabled={contact._creatingCompany}
                      className="text-xs text-forest-600 hover:underline"
                    >
                      {contact._creatingCompany ? "Creating…" : "Create company"}
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                <input
                  type="tel"
                  value={contact.phone}
                  onChange={e => onChange({ ...contact, phone: e.target.value })}
                  placeholder="Phone"
                  className="w-full h-8 px-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-forest-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input
                  type="email"
                  value={contact.email}
                  onChange={e => onChange({ ...contact, email: e.target.value })}
                  placeholder="Email"
                  className="w-full h-8 px-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-forest-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Stage</label>
                <select
                  value={contact.stage}
                  onChange={e => onChange({ ...contact, stage: e.target.value as ReferralContactStage })}
                  className="w-full h-8 px-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-forest-500 bg-white"
                >
                  {(["Identified","Met","Agreed to Refer","Shared Leads","Active Referral"] as ReferralContactStage[]).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <button onClick={onDelete} className="text-gray-300 hover:text-red-500 transition-colors mt-1 shrink-0">
              <IconTrash size={15} />
            </button>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea
              value={contact.notes}
              onChange={e => onChange({ ...contact, notes: e.target.value })}
              rows={2}
              className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-forest-500 resize-none"
              placeholder="Context…"
            />
          </div>
          {contact._error && <p className="text-xs text-red-500">{contact._error}</p>}
          <div className="flex justify-end">
            <button
              onClick={onSave}
              disabled={contact._saving || missingRequired}
              className="h-8 px-4 bg-forest-600 text-white text-sm font-medium rounded-lg hover:bg-forest-700 disabled:opacity-40 transition-colors flex items-center gap-2"
            >
              {contact._saving && <IconSpinner size={13} />}
              {contact._saving ? "Adding…" : "Add to CRM"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, count, accent, children }: {
  title: string; count: number; accent: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", accent)}>{count}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function VoiceLogTab({
  referralContacts,
  companies,
}: {
  referralContacts: ReferralContact[];
  companies: ReferralCompany[];
}) {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Results state
  const [activities, setActivities] = useState<ParsedActivity[]>([]);
  const [nextSteps, setNextSteps] = useState<ParsedNextStep[]>([]);
  const [clientLeads, setClientLeads] = useState<ParsedClientLead[]>([]);
  const [refContacts, setRefContacts] = useState<ParsedRefContact[]>([]);

  // Commit state (activities + next steps together)
  const [committing, setCommitting] = useState(false);
  const [commitDone, setCommitDone] = useState(false);
  const [commitErrors, setCommitErrors] = useState<string[]>([]);

  // SpeechRecognition
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef("");
  const recordingStateRef = useRef<RecordingState>("idle");

  // Keep ref in sync with state
  useEffect(() => { recordingStateRef.current = recordingState; }, [recordingState]);

  const supported = typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  function startRecognition() {
    const SR = ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) as any;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (event: any) => {
      let final = transcriptRef.current;
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript + " ";
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      transcriptRef.current = final;
      setTranscript(final);
      setInterimText(interim);
    };

    rec.onerror = (event: any) => {
      if (event.error === "not-allowed") {
        setParseError("Microphone access denied. Please allow microphone access in your browser settings and try again.");
        setRecordingState("error");
      } else if (event.error !== "no-speech") {
        console.error("[voice] recognition error:", event.error);
      }
    };

    rec.onend = () => {
      // Auto-restart if we're still supposed to be recording
      if (recordingStateRef.current === "recording") {
        try { rec.start(); } catch { /* ignore */ }
      }
    };

    try {
      rec.start();
      recognitionRef.current = rec;
      transcriptRef.current = "";
      setTranscript("");
      setInterimText("");
      setRecordingState("recording");
    } catch {
      setParseError("Failed to start microphone. Please check your browser permissions.");
      setRecordingState("error");
    }
  }

  function stopRecording() {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // prevent auto-restart
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    const finalText = transcriptRef.current.trim();
    setInterimText("");
    if (!finalText) {
      setParseError("No speech was captured. Please try again.");
      setRecordingState("error");
      return;
    }
    processTranscript(finalText);
  }

  const processTranscript = useCallback(async (text: string) => {
    setRecordingState("processing");
    setParseError(null);
    try {
      const res = await fetch("/api/voice-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Parsing failed");

      const today = new Date().toISOString().split("T")[0];
      setActivities((data.activitiesToLog ?? []).map((a: any) => ({
        _id: uid(), contactId: a.contactId ?? null, contactName: a.contactName ?? "",
        companyName: a.companyName ?? "", type: a.type ?? "Note",
        date: a.date ?? today, notes: a.notes ?? "",
      })));
      setNextSteps((data.nextSteps ?? []).map((s: any) => ({
        _id: uid(), contactId: s.contactId ?? null, contactName: s.contactName ?? "",
        companyName: s.companyName ?? "", nextStepDate: s.nextStepDate ?? "",
        nextStepNote: s.nextStepNote ?? "",
      })));
      setClientLeads((data.newClientLeads ?? []).map((l: any) => ({
        _id: uid(), name: l.name ?? "", email: l.email ?? "", phone: l.phone ?? "",
        source: l.source ?? "Voice Log", notes: l.notes ?? "",
        _saving: false, _saved: false, _error: null,
      })));
      setRefContacts((data.newReferralContacts ?? []).map((c: any) => ({
        _id: uid(), name: c.name ?? "", title: c.title ?? "", email: c.email ?? "",
        phone: c.phone ?? "", companyName: c.companyName ?? "", companyId: c.companyId ?? null,
        notes: c.notes ?? "", stage: c.stage ?? "Identified",
        _saving: false, _saved: false, _error: null, _creatingCompany: false,
      })));
      setCommitDone(false);
      setCommitErrors([]);
      setRecordingState("results");
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Failed to analyze recording");
      setRecordingState("error");
    }
  }, []);

  async function commitActivitiesAndNextSteps() {
    setCommitting(true);
    const errors: string[] = [];
    const today = new Date().toISOString().split("T")[0];

    // Log activities
    for (const act of activities) {
      try {
        const res = await fetch("/api/crm/activities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientContactId: act.contactId || undefined,
            type: act.type,
            note: act.notes || `${act.type} with ${act.contactName}`,
            activityDate: act.date || today,
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          errors.push(`Activity "${act.contactName}": ${d.error ?? "Failed"}`);
        }
      } catch {
        errors.push(`Activity "${act.contactName}": network error`);
      }
    }

    // Update next steps on contacts
    for (const step of nextSteps) {
      if (!step.contactId) {
        errors.push(`Next step for "${step.contactName}": no matched contact — skipped`);
        continue;
      }
      try {
        const res = await fetch("/api/crm/contacts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: step.contactId,
            nextStepDate: step.nextStepDate || null,
            nextStepNote: step.nextStepNote,
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          errors.push(`Next step for "${step.contactName}": ${d.error ?? "Failed"}`);
        }
      } catch {
        errors.push(`Next step for "${step.contactName}": network error`);
      }
    }

    setCommitting(false);
    setCommitErrors(errors);
    setCommitDone(true);
  }

  async function saveClientLead(id: string) {
    setClientLeads(prev => prev.map(l => l._id === id ? { ...l, _saving: true, _error: null } : l));
    const lead = clientLeads.find(l => l._id === id);
    if (!lead) return;
    try {
      const res = await fetch("/api/crm/client-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: lead.name, email: lead.email || undefined, phone: lead.phone || undefined, source: lead.source || "Voice Log", notes: lead.notes || undefined }),
      });
      if (!res.ok) {
        const d = await res.json();
        setClientLeads(prev => prev.map(l => l._id === id ? { ...l, _saving: false, _error: d.error ?? "Failed" } : l));
      } else {
        setClientLeads(prev => prev.map(l => l._id === id ? { ...l, _saving: false, _saved: true } : l));
      }
    } catch {
      setClientLeads(prev => prev.map(l => l._id === id ? { ...l, _saving: false, _error: "Network error" } : l));
    }
  }

  async function createCompanyForContact(contactId: string) {
    const contact = refContacts.find(c => c._id === contactId);
    if (!contact || !contact.companyName.trim()) return;
    setRefContacts(prev => prev.map(c => c._id === contactId ? { ...c, _creatingCompany: true } : c));
    try {
      const res = await fetch("/api/crm/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: contact.companyName }),
      });
      if (res.ok) {
        const { company } = await res.json();
        setRefContacts(prev => prev.map(c => c._id === contactId ? { ...c, companyId: company.id, _creatingCompany: false } : c));
      } else {
        setRefContacts(prev => prev.map(c => c._id === contactId ? { ...c, _creatingCompany: false } : c));
      }
    } catch {
      setRefContacts(prev => prev.map(c => c._id === contactId ? { ...c, _creatingCompany: false } : c));
    }
  }

  async function saveRefContact(id: string) {
    setRefContacts(prev => prev.map(c => c._id === id ? { ...c, _saving: true, _error: null } : c));
    const contact = refContacts.find(c => c._id === id);
    if (!contact) return;
    try {
      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contact.name, title: contact.title || undefined, email: contact.email || undefined,
          phone: contact.phone || undefined, referralCompanyId: contact.companyId,
          notes: contact.notes || undefined, stage: contact.stage,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setRefContacts(prev => prev.map(c => c._id === id ? { ...c, _saving: false, _error: d.error ?? "Failed" } : c));
      } else {
        setRefContacts(prev => prev.map(c => c._id === id ? { ...c, _saving: false, _saved: true } : c));
      }
    } catch {
      setRefContacts(prev => prev.map(c => c._id === id ? { ...c, _saving: false, _error: "Network error" } : c));
    }
  }

  function reset() {
    setRecordingState("idle");
    setTranscript("");
    setInterimText("");
    setParseError(null);
    setActivities([]);
    setNextSteps([]);
    setClientLeads([]);
    setRefContacts([]);
    setCommitDone(false);
    setCommitErrors([]);
    transcriptRef.current = "";
  }

  const hasActionsLeft = activities.length > 0 || nextSteps.length > 0;
  const allEmpty = activities.length === 0 && nextSteps.length === 0 && clientLeads.length === 0 && refContacts.length === 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  if (recordingState === "idle") {
    return (
      <div className="flex flex-col items-center justify-center min-h-80 gap-6 py-16">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Log with Voice</h2>
          <p className="text-sm text-gray-500 max-w-sm">
            Speak naturally about your day — meetings, follow-ups, new contacts — and AI will parse it into structured CRM entries.
          </p>
        </div>
        {!supported ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800 text-center max-w-sm">
            <p className="font-medium mb-1">Voice not supported</p>
            <p className="text-xs">Use Chrome or Edge for voice recording. Safari and Firefox are not supported.</p>
          </div>
        ) : (
          <button
            onClick={startRecognition}
            className="w-24 h-24 rounded-full bg-forest-600 hover:bg-forest-700 text-white shadow-lg hover:shadow-xl transition-all active:scale-95 flex items-center justify-center"
          >
            <IconMic size={36} />
          </button>
        )}
        <p className="text-xs text-gray-400">Tap the microphone to start recording</p>
      </div>
    );
  }

  if (recordingState === "recording") {
    const liveText = transcript + interimText;
    return (
      <div className="flex flex-col items-center gap-6 py-12">
        {/* Animated mic button */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" />
          <button
            onClick={stopRecording}
            className="relative w-24 h-24 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg transition-all active:scale-95 flex items-center justify-center"
          >
            <IconStop size={30} />
          </button>
        </div>
        {/* Waveform */}
        <div className="flex items-end gap-1 h-10">
          {[40, 70, 55, 85, 45, 75, 50].map((h, i) => (
            <div
              key={i}
              className="w-1.5 bg-red-400 rounded-full"
              style={{
                height: `${h}%`,
                animation: `bounce 0.6s ease-in-out infinite alternate`,
                animationDelay: `${i * 0.08}s`,
              }}
            />
          ))}
        </div>
        <p className="text-sm font-medium text-red-600">Recording… tap stop when done</p>
        {liveText && (
          <div className="w-full max-w-lg bg-gray-50 rounded-xl p-4 text-sm text-gray-600 max-h-36 overflow-y-auto">
            {transcript}<span className="text-gray-400 italic">{interimText}</span>
          </div>
        )}
      </div>
    );
  }

  if (recordingState === "processing") {
    return (
      <div className="flex flex-col items-center justify-center min-h-80 gap-4">
        <IconSpinner size={40} />
        <p className="text-sm font-medium text-gray-700">Analyzing your recording…</p>
        <p className="text-xs text-gray-400">Claude is parsing your transcript into CRM entries</p>
      </div>
    );
  }

  if (recordingState === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-80 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-xl px-6 py-5 text-center max-w-md">
          <IconAlert size={24} />
          <p className="text-sm font-medium text-red-700 mb-1">Something went wrong</p>
          <p className="text-xs text-red-600">{parseError}</p>
        </div>
        <button onClick={reset} className="h-9 px-5 border border-gray-300 text-sm text-gray-700 rounded-xl hover:border-forest-500 hover:text-forest-700 transition-colors">
          Try Again
        </button>
      </div>
    );
  }

  // ── Results ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 max-w-2xl">

      {/* Raw transcript toggle */}
      {transcript && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setTranscriptOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
          >
            <span>Raw Transcript</span>
            {transcriptOpen ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}
          </button>
          {transcriptOpen && (
            <div className="px-4 pb-4 text-sm text-gray-600 border-t border-gray-200 pt-3 leading-relaxed">
              {transcript}
            </div>
          )}
        </div>
      )}

      {/* Nothing parsed */}
      {allEmpty && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
          <p className="text-sm font-medium text-amber-700">Nothing was parsed from your recording.</p>
          <p className="text-xs text-amber-600 mt-1">Try speaking more clearly or use the transcript above to see what was captured.</p>
          <button onClick={reset} className="mt-3 h-9 px-5 border border-amber-300 text-sm text-amber-700 rounded-xl hover:bg-amber-100 transition-colors">
            Record Again
          </button>
        </div>
      )}

      {/* Activities + Next Steps commit section */}
      {(activities.length > 0 || nextSteps.length > 0) && (
        <div className="space-y-6">
          {activities.length > 0 && (
            <Section title="Activities to Log" count={activities.length} accent="bg-blue-100 text-blue-700">
              {activities.map(act => (
                <ActivityCard
                  key={act._id} act={act}
                  referralContacts={referralContacts} companies={companies}
                  onChange={updated => setActivities(prev => prev.map(a => a._id === updated._id ? updated : a))}
                  onDelete={() => setActivities(prev => prev.filter(a => a._id !== act._id))}
                />
              ))}
            </Section>
          )}

          {nextSteps.length > 0 && (
            <Section title="Next Steps" count={nextSteps.length} accent="bg-amber-100 text-amber-700">
              {nextSteps.map(step => (
                <NextStepCard
                  key={step._id} step={step}
                  referralContacts={referralContacts} companies={companies}
                  onChange={updated => setNextSteps(prev => prev.map(s => s._id === updated._id ? updated : s))}
                  onDelete={() => setNextSteps(prev => prev.filter(s => s._id !== step._id))}
                />
              ))}
            </Section>
          )}

          {/* Commit button */}
          {!commitDone ? (
            <div className="flex flex-col gap-2">
              <button
                onClick={commitActivitiesAndNextSteps}
                disabled={committing || !hasActionsLeft}
                className="h-11 px-6 bg-forest-600 text-white text-sm font-semibold rounded-xl hover:bg-forest-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2 self-start"
              >
                {committing && <IconSpinner size={15} />}
                {committing ? "Logging…" : `Log ${[activities.length > 0 && `${activities.length} Activit${activities.length === 1 ? "y" : "ies"}`, nextSteps.length > 0 && `${nextSteps.length} Next Step${nextSteps.length === 1 ? "" : "s"}`].filter(Boolean).join(" & ")}`}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                <IconCheck size={16} /> Activities and next steps logged.
              </div>
              {commitErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                  {commitErrors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* New client leads */}
      {clientLeads.length > 0 && (
        <Section title="New Client Leads" count={clientLeads.length} accent="bg-purple-100 text-purple-700">
          {clientLeads.map(lead => (
            <ClientLeadCard
              key={lead._id} lead={lead}
              onChange={updated => setClientLeads(prev => prev.map(l => l._id === updated._id ? updated : l))}
              onDelete={() => setClientLeads(prev => prev.filter(l => l._id !== lead._id))}
              onSave={() => saveClientLead(lead._id)}
            />
          ))}
        </Section>
      )}

      {/* New referral contacts */}
      {refContacts.length > 0 && (
        <Section title="New Referral Contacts" count={refContacts.length} accent="bg-green-100 text-green-700">
          {refContacts.map(contact => (
            <RefContactCard
              key={contact._id} contact={contact} companies={companies}
              onChange={updated => setRefContacts(prev => prev.map(c => c._id === updated._id ? updated : c))}
              onDelete={() => setRefContacts(prev => prev.filter(c => c._id !== contact._id))}
              onSave={() => saveRefContact(contact._id)}
              onCreateCompany={() => createCompanyForContact(contact._id)}
            />
          ))}
        </Section>
      )}

      {/* New recording button */}
      <div className="pt-2 border-t border-gray-100">
        <button
          onClick={reset}
          className="h-9 px-4 border border-gray-300 text-sm text-gray-600 rounded-xl hover:border-forest-500 hover:text-forest-700 transition-colors flex items-center gap-2"
        >
          <IconMic size={14} /> New Recording
        </button>
      </div>
    </div>
  );
}
