"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { StaffMemberWithGoals } from "./StaffGoalsTab";
import type { Skill } from "./StaffSkillsTab";

// ─── Types ────────────────────────────────────────────────────────────────────
type InputMode = "structured" | "freetext" | "voice";

interface StructuredInput {
  originAddress: string;
  destinationAddress: string;
  projectDate: string;
  teamLeadsNeeded: number;
  staffNeeded: number;
  requiredSkills: string[];
  maxDriveMiles: string;
  notes: string;
}

interface HistoryEntry {
  timestamp: string;
  input: string;
  output: string;
}

interface AIStaffMappingTabProps {
  members?: (StaffMemberWithGoals & { skills?: string[]; scheduledHoursThisWeek?: number })[];
  skills?: Skill[];
}

const HISTORY_KEY = "rightsize_ai_mapping_history";
const MAX_HISTORY = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTimestamp(ts: string) {
  try {
    return new Date(ts).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  } catch { return ts; }
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch { return []; }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
  } catch {}
}

// Render output text: highlight ⚠️ lines, bold **text**
function RenderOutput({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed space-y-0.5">
      {lines.map((line, i) => {
        if (line.includes("⚠️")) {
          return (
            <div key={i} className="border-l-4 border-amber-400 pl-3 py-0.5 bg-amber-50/50">
              <BoldText text={line} />
            </div>
          );
        }
        return <div key={i}><BoldText text={line} /></div>;
      })}
    </div>
  );
}

function BoldText({ text }: { text: string }) {
  const parts = text.split(/\*\*/);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>
      )}
    </>
  );
}

// ─── Number Stepper ───────────────────────────────────────────────────────────
function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-7 h-7 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 font-bold text-lg leading-none flex items-center justify-center"
        >−</button>
        <span className="w-8 text-center font-semibold text-gray-900">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="w-7 h-7 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 font-bold text-lg leading-none flex items-center justify-center"
        >+</button>
      </div>
    </div>
  );
}

// ─── Skill Multi-Select ───────────────────────────────────────────────────────
function SkillMultiSelect({
  skills, selected, onChange
}: {
  skills: Skill[];
  selected: string[];
  onChange: (s: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const filtered = skills.filter(s => s.isActive && (search === "" || s.skillName.toLowerCase().includes(search.toLowerCase())));
  const toggle = (name: string) => onChange(selected.includes(name) ? selected.filter(s => s !== name) : [...selected, name]);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Required Skills</label>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(s => (
            <span key={s} className="inline-flex items-center gap-1 text-xs bg-forest-100 text-forest-700 px-2 py-0.5 rounded-full font-medium">
              {s}
              <button onClick={() => toggle(s)} className="hover:opacity-70">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-left text-gray-500 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-forest-600/30"
        >
          {selected.length === 0 ? "Select required skills..." : `${selected.length} skill${selected.length !== 1 ? "s" : ""} selected`}
        </button>
        {open && (
          <div className="absolute z-10 top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <input
                autoFocus
                type="text"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filtered.map(s => (
                <label key={s.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(s.skillName)}
                    onChange={() => toggle(s.skillName)}
                    className="rounded border-gray-300 text-forest-600"
                  />
                  <span className="text-sm text-gray-800">{s.skillName}</span>
                  <span className="text-xs text-gray-400 ml-auto">{s.skillCategory}</span>
                </label>
              ))}
              {filtered.length === 0 && <div className="px-3 py-4 text-sm text-gray-400 text-center">No skills found</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Voice Input ──────────────────────────────────────────────────────────────
type VoiceState = "idle" | "recording" | "processing";

function VoiceInputPanel({ onTranscript }: { onTranscript: (t: string) => void }) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      if (!(w.SpeechRecognition || w.webkitSpeechRecognition)) setSupported(false);
    }
  }, []);

  function startRecording() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRec) return;
    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    recognitionRef.current = rec;

    let final = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setTranscript(final + interim);
    };
    rec.onerror = () => { setVoiceState("idle"); };
    rec.onend = () => { setVoiceState("idle"); };

    rec.start();
    setVoiceState("recording");
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setVoiceState("processing");
    setTimeout(() => setVoiceState("idle"), 400);
  }

  function toggleMic() {
    if (voiceState === "idle") startRecording();
    else stopRecording();
  }

  if (!supported) {
    return (
      <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-4">
        Voice input is not supported in this browser. Please use Chrome or Edge.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 py-4">
        <button
          type="button"
          onClick={toggleMic}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-md ${
            voiceState === "recording"
              ? "bg-red-500 hover:bg-red-600 animate-pulse"
              : "bg-gray-200 hover:bg-gray-300"
          }`}
        >
          <svg className="h-7 w-7 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z" />
          </svg>
        </button>
        <p className="text-sm text-gray-500">
          {voiceState === "idle" && "Click mic to start"}
          {voiceState === "recording" && "Recording... (click to stop)"}
          {voiceState === "processing" && "Processing..."}
        </p>
      </div>
      {transcript && (
        <textarea
          value={transcript}
          onChange={e => setTranscript(e.target.value)}
          rows={5}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-forest-600/30 resize-none"
          placeholder="Transcription will appear here..."
        />
      )}
      {transcript && (
        <button
          type="button"
          onClick={() => onTranscript(transcript)}
          className="w-full text-sm text-forest-700 border border-forest-200 hover:bg-forest-50 py-2 rounded-lg font-medium transition-colors"
        >
          Use this transcription
        </button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function AIStaffMappingTab({ members: initialMembers, skills: initialSkills }: AIStaffMappingTabProps) {
  const [members, setMembers] = useState<(StaffMemberWithGoals & { skills?: string[]; scheduledHoursThisWeek?: number })[]>(initialMembers ?? []);
  const [skills, setSkills] = useState<Skill[]>(initialSkills ?? []);
  const [mode, setMode] = useState<InputMode>("structured");
  const [structured, setStructured] = useState<StructuredInput>({
    originAddress: "", destinationAddress: "", projectDate: "",
    teamLeadsNeeded: 1, staffNeeded: 2, requiredSkills: [], maxDriveMiles: "", notes: "",
  });
  const [freetext, setFreetext] = useState("");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [output, setOutput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingHistory, setViewingHistory] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { setHistory(loadHistory()); }, []);

  // Self-fetch goals and skills data if not provided as props
  useEffect(() => {
    if (!initialMembers) {
      fetch("/api/staff/goals").then(r => r.ok ? r.json() : null).then(data => {
        if (data?.staff) setMembers(data.staff);
      }).catch(() => {});
    }
    if (!initialSkills) {
      fetch("/api/skills").then(r => r.ok ? r.json() : null).then(data => {
        if (data?.skills) setSkills(data.skills);
      }).catch(() => {});
    }
  }, [initialMembers, initialSkills]);

  const getInputText = useCallback((): string => {
    if (mode === "structured") {
      return JSON.stringify(structured);
    }
    if (mode === "freetext") return freetext;
    return voiceTranscript;
  }, [mode, structured, freetext, voiceTranscript]);

  const hasInput = (() => {
    if (mode === "structured") return structured.originAddress.trim() !== "" || structured.projectDate !== "";
    if (mode === "freetext") return freetext.trim().length > 10;
    return voiceTranscript.trim().length > 10;
  })();

  async function generate() {
    if (!hasInput || generating) return;
    setGenerating(true);
    setOutput("");
    setViewingHistory(false);

    const payload = {
      mode,
      structuredInput: mode === "structured" ? {
        originAddress: structured.originAddress,
        destinationAddress: structured.destinationAddress || undefined,
        projectDate: structured.projectDate,
        teamLeadsNeeded: structured.teamLeadsNeeded,
        staffNeeded: structured.staffNeeded,
        requiredSkills: structured.requiredSkills,
        maxDriveMiles: structured.maxDriveMiles ? Number(structured.maxDriveMiles) : undefined,
        notes: structured.notes || undefined,
      } : undefined,
      freetextInput: mode === "freetext" ? freetext : mode === "voice" ? voiceTranscript : undefined,
      members: members.map(m => ({
        id: m.id,
        displayName: m.displayName,
        role: m.roleType ?? "Staff",
        skills: m.skills ?? [],
        minWeeklyHours: m.minWeeklyHours,
        targetWeeklyHours: m.targetWeeklyHours,
        maxWeeklyHours: m.maxWeeklyHours,
        scheduledHoursThisWeek: m.scheduledHoursThisWeek ?? 0,
      })),
    };

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/staff/ai-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setOutput("Error: failed to generate recommendation.");
        setGenerating(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullOutput = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        fullOutput += chunk;
        setOutput(prev => prev + chunk);
      }

      // Save to history
      const entry: HistoryEntry = {
        timestamp: new Date().toISOString(),
        input: getInputText().slice(0, 200),
        output: fullOutput,
      };
      const updated = [entry, ...loadHistory()].slice(0, MAX_HISTORY);
      saveHistory(updated);
      setHistory(updated);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setOutput("Error: " + String(err));
      }
    } finally {
      setGenerating(false);
    }
  }

  function copyOutput() {
    navigator.clipboard.writeText(output).catch(() => {});
  }

  function startOver() {
    setOutput("");
    setViewingHistory(false);
    abortRef.current?.abort();
  }

  function loadFromHistory(entry: HistoryEntry) {
    setOutput(entry.output);
    setViewingHistory(true);
    setHistoryOpen(false);
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Input panel */}
      <div className="lg:w-1/2 space-y-5">
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {/* Mode tabs */}
          <div className="flex border-b border-gray-100">
            {(["structured", "freetext", "voice"] as InputMode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  mode === m ? "text-forest-700 border-b-2 border-forest-600 bg-forest-50/50" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {m === "structured" ? "Structured Form" : m === "freetext" ? "Free Text" : "Voice Input"}
              </button>
            ))}
          </div>

          <div className="p-5">
            {/* Mode 1: Structured Form */}
            {mode === "structured" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Project Origin Address</label>
                  <input
                    type="text"
                    placeholder="123 Main St, City, IL"
                    value={structured.originAddress}
                    onChange={e => setStructured(s => ({ ...s, originAddress: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-forest-600/30 focus:border-forest-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Destination Address <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Destination address (optional)"
                    value={structured.destinationAddress}
                    onChange={e => setStructured(s => ({ ...s, destinationAddress: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-forest-600/30 focus:border-forest-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Project Date</label>
                  <input
                    type="date"
                    value={structured.projectDate}
                    onChange={e => setStructured(s => ({ ...s, projectDate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-forest-600/30 focus:border-forest-600"
                  />
                </div>
                <div className="flex gap-6">
                  <Stepper
                    label="Team Leads Needed"
                    value={structured.teamLeadsNeeded}
                    onChange={v => setStructured(s => ({ ...s, teamLeadsNeeded: v }))}
                  />
                  <Stepper
                    label="Staff Members Needed"
                    value={structured.staffNeeded}
                    onChange={v => setStructured(s => ({ ...s, staffNeeded: v }))}
                  />
                </div>
                <SkillMultiSelect
                  skills={skills}
                  selected={structured.requiredSkills}
                  onChange={v => setStructured(s => ({ ...s, requiredSkills: v }))}
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Drive Distance (miles)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="No limit (miles)"
                    value={structured.maxDriveMiles}
                    onChange={e => setStructured(s => ({ ...s, maxDriveMiles: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-forest-600/30 focus:border-forest-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Additional Notes <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <textarea
                    placeholder="Any special requirements or context..."
                    value={structured.notes}
                    onChange={e => setStructured(s => ({ ...s, notes: e.target.value }))}
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-forest-600/30 focus:border-forest-600 resize-none"
                  />
                </div>
              </div>
            )}

            {/* Mode 2: Free Text */}
            {mode === "freetext" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Describe the project</label>
                <textarea
                  value={freetext}
                  onChange={e => setFreetext(e.target.value)}
                  rows={8}
                  placeholder={"E.g.: We have a move at 1234 N Michigan Ave on June 14. Need 1 team lead and 3 staff. The client has a lot of art and antiques — we need someone with fine art handling experience. Try to keep people within 30 miles."}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-forest-600/30 resize-none"
                />
              </div>
            )}

            {/* Mode 3: Voice */}
            {mode === "voice" && (
              <VoiceInputPanel onTranscript={t => { setVoiceTranscript(t); }} />
            )}

            <button
              onClick={generate}
              disabled={!hasInput || generating}
              className="w-full mt-5 bg-forest-600 hover:bg-forest-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-semibold text-sm transition-colors"
            >
              {generating ? "Generating..." : "Generate Recommendation"}
            </button>
          </div>
        </div>

        {/* Recent Sessions */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <button
            onClick={() => setHistoryOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Recent Sessions ({history.length})
            <svg className={`h-4 w-4 text-gray-400 transition-transform ${historyOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {historyOpen && (
            <div className="border-t border-gray-100 divide-y divide-gray-50">
              {history.length === 0 ? (
                <p className="px-5 py-4 text-sm text-gray-400">No sessions yet.</p>
              ) : (
                history.map((entry, i) => (
                  <button
                    key={i}
                    onClick={() => loadFromHistory(entry)}
                    className="w-full px-5 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <p className="text-xs text-gray-400 font-medium">{fmtTimestamp(entry.timestamp)}</p>
                    <p className="text-sm text-gray-700 mt-0.5 truncate">{entry.input.slice(0, 60)}</p>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Output panel */}
      <div className="lg:w-1/2">
        <div className="bg-white border border-gray-200 rounded-2xl min-h-[400px] flex flex-col">
          {/* Output header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">
              {viewingHistory ? "Saved Session" : "AI Recommendation"}
            </p>
            {output && !generating && (
              <div className="flex gap-2">
                <button
                  onClick={copyOutput}
                  className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2.5 py-1 rounded-lg"
                >
                  Copy
                </button>
                <button
                  onClick={startOver}
                  className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2.5 py-1 rounded-lg"
                >
                  Start Over
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 p-5">
            {generating && output === "" ? (
              /* Generating skeleton */
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                  <svg className="animate-spin h-4 w-4 text-forest-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V0a12 12 0 100 24v-4l-3 3 3 3V24a12 12 0 010-24z" />
                  </svg>
                  Analyzing staff data...
                </div>
                {[...Array(4)].map((_, i) => (
                  <div key={i} className={`h-4 bg-gray-100 rounded animate-pulse`} style={{ width: `${85 - i * 12}%` }} />
                ))}
              </div>
            ) : output ? (
              <div>
                {generating && (
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V0a12 12 0 100 24v-4l-3 3 3 3V24a12 12 0 010-24z" />
                    </svg>
                    Generating...
                  </div>
                )}
                <RenderOutput text={output} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                <svg className="h-12 w-12 text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 01-.659 1.591L9.75 14.5M14.25 3.104c.251.023.501.05.75.082M19.5 10.5c0 7.529-7.5 13.5-7.5 13.5s-7.5-5.971-7.5-13.5a7.5 7.5 0 0115 0z" />
                </svg>
                <p className="text-gray-400 text-sm">Fill out the form and click<br /><strong className="text-gray-600">Generate Recommendation</strong></p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
