"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useBackClose } from "@/lib/back-button";
import { safeJson } from "@/lib/utils";
import type { HubPerson, HubProject, ProjectMembers, ProjectMember } from "@/lib/messaging-hub";
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
  TTTAdmin: "Admin", TTTManager: "Manager", TTTSales: "Sales", TTTTeamLead: "Team Lead", TTTStaff: "Staff",
};

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

export function MembersSheet({ project, meId, onClose, onMessage }: { project: { tenantId: string; name: string }; meId: string; onClose: () => void; onMessage: (personId: string) => void }) {
  const [members, setMembers] = useState<ProjectMembers | null>(null);
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
          <SectionLabel>Team Lead</SectionLabel>
          {members.teamLead ? (
            <MemberRow m={members.teamLead} meId={meId} detail="Runs this project day to day" onMessage={onMessage} />
          ) : (
            <p className="px-3 py-2 text-sm text-gray-500">No Team Lead assigned yet.</p>
          )}

          <SectionLabel>Crew{members.crew.length > 0 && ` · ${members.crew.length}`}</SectionLabel>
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
              <span className="block text-[15px] font-semibold text-gray-900">Managers, Admins &amp; Sales</span>
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
