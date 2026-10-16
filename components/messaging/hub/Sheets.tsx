"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useBackClose } from "@/lib/back-button";
import { safeJson } from "@/lib/utils";
import type { HubPerson, HubProject, ProjectMembers, ProjectMember } from "@/lib/messaging-hub";
import type { NotifyLevel, NotifyPrefs, QuietHours } from "@/lib/notify-prefs";
import { Avatar, CloseIcon, ProjectGlyph, formatShiftDate } from "./shared";

/** Bottom sheet on phones, centered dialog on desktop. */
export function Sheet({ title, subtitle, onClose, children, tall }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; tall?: boolean }) {
  useBackClose(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col ${tall ? "h-[88dvh] sm:h-[75vh]" : "max-h-[88dvh] sm:max-h-[75vh]"} motion-safe:animate-[fadeInScale_0.2s_ease-out]`}
        style={{ paddingBottom: "var(--sab)" }}
      >
        <div className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-gray-200" aria-hidden="true" />
        <div className="shrink-0 flex items-start justify-between gap-3 px-5 pt-3 sm:pt-5 pb-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 leading-snug truncate">{title}</h2>
            {subtitle && <p className="text-sm text-gray-500 truncate">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-2 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-4">{children}</div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="px-3 pt-4 pb-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">{children}</p>;
}

/** "Team Lead · Kay Lincicome, Smith Estate +2" */
export function leadsLabel(leads: { name: string }[], max = 2): string {
  if (leads.length === 0) return "";
  const names = leads.slice(0, max).map((l) => l.name).join(", ");
  return `Team Lead · ${names}${leads.length > max ? ` +${leads.length - max}` : ""}`;
}

const ROLE_LABEL: Record<string, string> = {
  TTTAdmin: "Admin", TTTManager: "Project Coord.", TTTSales: "Sales", TTTTeamLead: "Team Lead", TTTStaff: "Specialist",
};

// ─── Notifications ───────────────────────────────────────────────────────────

const LEVELS: { level: NotifyLevel; label: string; detail: string }[] = [
  { level: "all", label: "All messages", detail: "A push for every new message" },
  { level: "mentions", label: "Mentions only", detail: "When someone @mentions you or replies to you" },
  { level: "none", label: "Nothing", detail: "No pushes, except Urgent messages" },
];

async function saveLevel(tenantId: string, level: NotifyLevel | null): Promise<string | null> {
  const res = await fetch("/api/messages/notify-prefs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, level }),
  }).catch(() => null);
  if (!res) return "Couldn't save — check your connection.";
  const d = await safeJson<{ error?: string }>(res);
  return res.ok ? null : d.error || "Couldn't save";
}

/** Per-project push setting. `defaultLevel` is what applies with no explicit choice. */
export function NotificationLevelPicker({ tenantId, level, defaultLevel, onChanged }: {
  tenantId: string;
  level: NotifyLevel;
  defaultLevel: NotifyLevel;
  onChanged?: (level: NotifyLevel) => void;
}) {
  const [current, setCurrent] = useState(level);
  const [error, setError] = useState("");
  useEffect(() => setCurrent(level), [level]);

  async function choose(next: NotifyLevel) {
    if (next === current) return;
    const prev = current;
    setCurrent(next);
    setError("");
    const err = await saveLevel(tenantId, next === defaultLevel ? null : next);
    if (err) { setCurrent(prev); setError(err); return; }
    onChanged?.(next);
  }

  return (
    <div className="px-3">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1" role="radiogroup" aria-label="Push notifications for this project">
        {LEVELS.map((l) => (
          <button
            key={l.level}
            type="button"
            role="radio"
            aria-checked={current === l.level}
            onClick={() => choose(l.level)}
            className={`h-10 rounded-lg text-sm font-semibold transition-colors ${current === l.level ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
          >
            {l.level === "all" ? "All" : l.level === "mentions" ? "Mentions" : "Nothing"}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {LEVELS.find((l) => l.level === current)?.detail}
        {current === defaultLevel && <span className="text-gray-400"> · default</span>}
      </p>
      {error && <p className="mt-1 text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}

// ─── Members ─────────────────────────────────────────────────────────────────

function MemberRow({ m, meId, detail, onMessage }: { m: ProjectMember; meId: string; detail?: string; onMessage: (id: string) => void }) {
  const isMe = m.id === meId;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
      <Avatar name={m.name} photoUrl={m.photoUrl} size={40} />
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold text-gray-900 truncate">{m.name}{isMe && <span className="font-normal text-gray-400"> (you)</span>}</p>
        {detail && <p className="text-xs text-gray-500 truncate">{detail}</p>}
      </div>
      {!isMe && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {m.phone && (
            <a href={`tel:${m.phone.replace(/[^\d+]/g, "")}`} aria-label={`Call ${m.name}`} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
            </a>
          )}
          <button type="button" onClick={() => onMessage(m.id)} className="h-10 px-3.5 rounded-full bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700">
            Message
          </button>
        </div>
      )}
    </div>
  );
}

export function MembersSheet({ project, meId, onClose, onMessage, onNotifyChanged }: {
  project: { tenantId: string; name: string };
  meId: string;
  onClose: () => void;
  onMessage: (personId: string) => void;
  onNotifyChanged?: () => void;
}) {
  const [members, setMembers] = useState<ProjectMembers | null>(null);
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/messages/notify-prefs")
      .then((r) => safeJson<{ prefs?: NotifyPrefs }>(r))
      .then((d) => { if (!cancelled && d.prefs) setPrefs(d.prefs); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const [error, setError] = useState("");
  const [showHq, setShowHq] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/messages/members?tenantId=${encodeURIComponent(project.tenantId)}`)
      .then(async (r) => {
        const d = await safeJson<ProjectMembers & { error?: string }>(r);
        if (!r.ok) throw new Error(d.error || "Couldn't load members");
        if (!cancelled) setMembers(d);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load members"); });
    return () => { cancelled = true; };
  }, [project.tenantId]);

  const total = members ? (members.teamLead ? 1 : 0) + members.crew.length + members.hq.length : 0;

  return (
    <Sheet title={`#${project.name}`} subtitle={members ? `${total} ${total === 1 ? "person" : "people"} in this channel` : "Members"} onClose={onClose}>
      {error ? (
        <p className="px-3 py-6 text-sm text-red-600 text-center">{error}</p>
      ) : !members ? (
        <p className="px-3 py-8 text-sm text-gray-400 text-center">Loading…</p>
      ) : (
        <>
          {prefs && (
            <>
              <SectionLabel>Your notifications</SectionLabel>
              {(() => {
                const defaultLevel: NotifyLevel = members.teamLead?.id === meId ? "all" : "mentions";
                return (
                  <NotificationLevelPicker
                    tenantId={project.tenantId}
                    level={prefs.projects[project.tenantId] ?? defaultLevel}
                    defaultLevel={defaultLevel}
                    onChanged={() => onNotifyChanged?.()}
                  />
                );
              })()}
            </>
          )}
          <SectionLabel>Team Lead</SectionLabel>
          {members.teamLead ? (
            <MemberRow m={members.teamLead} meId={meId} detail="Runs this project day to day" onMessage={onMessage} />
          ) : (
            <p className="px-3 py-2 text-sm text-gray-500">No Team Lead assigned yet.</p>
          )}

          <SectionLabel>Specialists{members.crew.length > 0 && ` · ${members.crew.length}`}</SectionLabel>
          {members.crew.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">No one is scheduled on this project&apos;s shifts yet.</p>
          ) : members.crew.map((m) => (
            <MemberRow
              key={m.id}
              m={m}
              meId={meId}
              detail={m.nextShift ? `Next shift ${formatShiftDate(m.nextShift)}` : m.lastShift ? `Last shift ${formatShiftDate(m.lastShift)}` : undefined}
              onMessage={onMessage}
            />
          ))}

          <SectionLabel>HQ</SectionLabel>
          <button
            type="button"
            onClick={() => setShowHq((v) => !v)}
            aria-expanded={showHq}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left"
          >
            <span className="flex -space-x-2">
              {members.hq.slice(0, 3).map((m) => <Avatar key={m.id} name={m.name} photoUrl={m.photoUrl} size={32} className="ring-2 ring-white" />)}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-semibold text-gray-900">Project Coords, Admins &amp; Sales</span>
              <span className="block text-xs text-gray-500">{members.hq.length} people · can see every project</span>
            </span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${showHq ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {showHq && members.hq.map((m) => (
            <MemberRow key={m.id} m={m} meId={meId} detail={ROLE_LABEL[m.role] ?? undefined} onMessage={onMessage} />
          ))}
        </>
      )}
    </Sheet>
  );
}

// ─── New message ─────────────────────────────────────────────────────────────

export function NewMessageSheet({ people, projects, meId, onClose, onPick }: {
  people: HubPerson[];
  projects: HubProject[];
  meId: string;
  onClose: () => void;
  onPick: (personId: string) => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  // "Your projects": the viewer's active projects, each with its Team Lead
  // one tap away — so a new crew member never has to know who leads what.
  const yourProjects = useMemo(() => projects
    .filter((p) => p.status === "active" && p.teamLeadId && p.teamLeadId !== meId && personById.has(p.teamLeadId))
    .filter((p) => !query || p.name.toLowerCase().includes(query) || (p.teamLeadName ?? "").toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name)),
  [projects, meId, personById, query]);

  const matchingPeople = useMemo(() => people.filter((p) =>
    !query || p.name.toLowerCase().includes(query) || p.leads.some((l) => l.name.toLowerCase().includes(query))
  ), [people, query]);

  return (
    <Sheet title="New message" subtitle="Direct messages are always one-to-one" onClose={onClose} tall>
      <div className="px-2 pt-1 pb-2 sticky top-0 bg-white z-[1]">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people or projects"
          aria-label="Search people or projects"
          className="w-full h-11 px-4 rounded-xl bg-gray-100 text-base sm:text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-forest-400 focus:bg-white"
        />
      </div>

      {yourProjects.length > 0 && (
        <>
          <SectionLabel>{query ? "Projects" : "Your projects' Team Leads"}</SectionLabel>
          {yourProjects.map((p) => {
            const lead = personById.get(p.teamLeadId!)!;
            return (
              <button key={p.tenantId} type="button" onClick={() => onPick(lead.id)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left">
                <ProjectGlyph size={40} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold text-gray-900 truncate">{p.name}</span>
                  <span className="block text-sm text-gray-500 truncate">Team Lead: <span className="text-gray-800 font-medium">{lead.name}</span></span>
                </span>
                <Avatar name={lead.name} photoUrl={lead.photoUrl} size={32} />
              </button>
            );
          })}
        </>
      )}

      <SectionLabel>People</SectionLabel>
      {matchingPeople.length === 0 ? (
        <p className="px-3 py-4 text-sm text-gray-500">No one matches &ldquo;{q}&rdquo;.</p>
      ) : matchingPeople.map((p) => (
        <button key={p.id} type="button" onClick={() => onPick(p.id)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left">
          <Avatar name={p.name} photoUrl={p.photoUrl} size={40} />
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-gray-900 truncate">{p.name}</span>
            <span className="block text-sm text-gray-500 truncate">{leadsLabel(p.leads) || ROLE_LABEL[p.role] || ""}</span>
          </span>
        </button>
      ))}
    </Sheet>
  );
}

// ─── Notification settings ───────────────────────────────────────────────────

const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function NotificationSettingsSheet({ projects, onClose, onChanged }: { projects: HubProject[]; onClose: () => void; onChanged: () => void }) {
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/messages/notify-prefs")
      .then((r) => safeJson<{ prefs?: NotifyPrefs; available?: boolean }>(r))
      .then((d) => { if (d.prefs) setPrefs(d.prefs); setAvailable(d.available !== false); })
      .catch(() => setError("Couldn't load your settings."));
  }, []);

  async function saveQuiet(quiet: QuietHours) {
    const prev = prefs;
    setPrefs((p) => (p ? { ...p, quiet } : p));
    setError("");
    setSaved(false);
    const res = await fetch("/api/messages/notify-prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quiet }),
    }).catch(() => null);
    if (!res?.ok) {
      setPrefs(prev);
      setError(res ? (await safeJson<{ error?: string }>(res)).error || "Couldn't save" : "Couldn't save — check your connection.");
      return;
    }
    setSaved(true);
  }

  const custom = prefs ? projects.filter((p) => prefs.projects[p.tenantId]) : [];
  const select = "h-10 px-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900";

  return (
    <Sheet title="Notifications" subtitle="Push notifications on your phone" onClose={onClose}>
      {!prefs ? (
        <p className="px-3 py-8 text-sm text-gray-400 text-center">{error || "Loading…"}</p>
      ) : (
        <>
          {!available && <p className="mx-3 mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Settings can&apos;t be saved right now.</p>}

          <SectionLabel>What you&apos;ll get</SectionLabel>
          <ul className="px-3 space-y-1.5 text-sm text-gray-700">
            <li><span className="font-semibold">Direct messages</span> — always</li>
            <li><span className="font-semibold">@mentions and replies to you</span> — always, unless a project is set to Nothing</li>
            <li><span className="font-semibold">Projects you lead</span> — every message</li>
            <li><span className="font-semibold">Other projects</span> — mentions only</li>
            <li><span className="font-semibold">Urgent</span> — always reaches the Team Lead and HQ</li>
          </ul>
          <p className="px-3 mt-2 text-xs text-gray-500">Change a project from its members panel (the people icon in the project).</p>

          <SectionLabel>Quiet hours</SectionLabel>
          <label className="mx-3 flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3.5 py-3">
            <span>
              <span className="block text-[15px] font-semibold text-gray-900">Pause notifications</span>
              <span className="block text-xs text-gray-500">Urgent messages still come through</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={prefs.quiet.enabled}
              onChange={(e) => saveQuiet({ ...prefs.quiet, enabled: e.target.checked })}
              className="w-5 h-5 accent-forest-600"
            />
          </label>
          {prefs.quiet.enabled && (
            <div className="mx-3 mt-3 flex items-center gap-2 flex-wrap text-sm text-gray-700">
              <span>From</span>
              <select aria-label="Quiet hours start" value={prefs.quiet.start} onChange={(e) => saveQuiet({ ...prefs.quiet, start: e.target.value })} className={select}>
                {TIMES.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}
              </select>
              <span>to</span>
              <select aria-label="Quiet hours end" value={prefs.quiet.end} onChange={(e) => saveQuiet({ ...prefs.quiet, end: e.target.value })} className={select}>
                {TIMES.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}
              </select>
              <span className="text-gray-400">Central Time</span>
            </div>
          )}
          {error && <p className="px-3 mt-2 text-xs text-red-600" role="alert">{error}</p>}
          {saved && !error && <p className="px-3 mt-2 text-xs text-forest-700" role="status">Saved</p>}

          {custom.length > 0 && (
            <>
              <SectionLabel>Projects with your own setting</SectionLabel>
              {custom.map((p) => (
                <div key={p.tenantId} className="flex items-center gap-3 px-3 py-2">
                  <ProjectGlyph size={32} />
                  <span className="flex-1 min-w-0 text-[15px] font-medium text-gray-900 truncate">{p.name}</span>
                  <select
                    aria-label={`Notifications for ${p.name}`}
                    value={prefs.projects[p.tenantId]}
                    onChange={async (e) => {
                      const level = e.target.value as NotifyLevel;
                      const err = await saveLevel(p.tenantId, level);
                      if (err) { setError(err); return; }
                      setPrefs((cur) => (cur ? { ...cur, projects: { ...cur.projects, [p.tenantId]: level } } : cur));
                      onChanged();
                    }}
                    className={select}
                  >
                    <option value="all">All</option>
                    <option value="mentions">Mentions</option>
                    <option value="none">Nothing</option>
                  </select>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
