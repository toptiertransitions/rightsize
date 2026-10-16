"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeJson } from "@/lib/utils";
import { useBackClose } from "@/lib/back-button";
import { BROADCAST_TENANT_ID, dmTenantId } from "@/lib/airtable-messages";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/project-status";
import type { HubData, HubPerson, HubProject, HubDm } from "@/lib/messaging-hub";
import { ConversationView, type ConversationInfo } from "./ConversationView";
import { MembersSheet, NewMessageSheet, NotificationSettingsSheet, leadsLabel } from "./Sheets";
import { Avatar, ProjectGlyph, AnnouncementGlyph, UnreadBadge, formatListTime, useIsCompact, useVisualViewport } from "./shared";

const LIST_POLL_MS = 60000;
const STATUS_FILTERS: ProjectStatus[] = ["active", "consignment", "not-signed", "archived"];
type Filter = "all" | "unread" | "mentions" | "dms" | "projects";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "mentions", label: "Mentions" },
  { key: "dms", label: "DMs" },
  { key: "projects", label: "Projects" },
];

const ROLE_LABEL: Record<string, string> = {
  TTTAdmin: "Admin", TTTManager: "Manager", TTTSales: "Sales", TTTTeamLead: "Team Lead", TTTStaff: "Staff",
};

interface Me { id: string; name: string; photoUrl?: string }

interface Resolved {
  key: string;
  info: ConversationInfo;
  unread: number;
  project?: HubProject;
}

function resolveConversation(key: string, data: HubData | null, me: Me): Resolved | null {
  if (key === "announcements") {
    return {
      key,
      info: { kind: "announcements", tenantId: BROADCAST_TENANT_ID, title: "Announcements", subtitle: "Company-wide from HQ" },
      unread: data?.announcements.unread ?? 0,
    };
  }
  if (key.startsWith("dm:")) {
    const otherId = key.slice(3);
    if (!otherId || otherId === me.id) return null;
    const person = data?.people.find((p) => p.id === otherId);
    const dm = data?.dms.find((d) => d.otherUserId === otherId);
    return {
      key,
      info: {
        kind: "dm",
        tenantId: dmTenantId(me.id, otherId),
        title: person?.name ?? "Direct message",
        subtitle: person ? (leadsLabel(person.leads, 3) || ROLE_LABEL[person.role]) : undefined,
        photoUrl: person?.photoUrl,
      },
      unread: dm?.unread ?? 0,
    };
  }
  if (key.startsWith("p:")) {
    const tenantId = key.slice(2);
    const project = data?.projects.find((p) => p.tenantId === tenantId);
    if (data && !project) return null;
    return {
      key,
      info: {
        kind: "project",
        tenantId,
        title: project?.name ?? "Project",
        subtitle: project ? [PROJECT_STATUS_LABELS[project.status], project.teamLeadName ? `Lead: ${project.teamLeadName}` : "No Team Lead yet"].join(" · ") : undefined,
      },
      unread: project?.unread ?? 0,
      project,
    };
  }
  return null;
}

// ─── List rows ───────────────────────────────────────────────────────────────

function BellOffIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-label="Notifications off">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9M3 3l18 18" />
    </svg>
  );
}

function Row({ selected, unread, onClick, icon, title, titleExtra, time, preview, muted, mentions = 0, silenced }: {
  selected: boolean;
  unread: number;
  mentions?: number;
  /** Notifications set to Nothing: greyed, with a bell-off icon. */
  silenced?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  titleExtra?: string;
  time: string;
  preview: string;
  muted?: boolean;
}) {
  const bold = unread > 0 && !silenced;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? "true" : undefined}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${selected ? "bg-forest-50" : "hover:bg-gray-50 active:bg-gray-100"}`}
    >
      {icon}
      <span className="flex-1 min-w-0">
        <span className="flex items-baseline gap-2">
          <span className={`truncate text-[15px] ${bold ? "font-bold text-gray-900" : silenced ? "font-semibold text-gray-500" : "font-semibold text-gray-800"}`}>{title}</span>
          {silenced && <BellOffIcon />}
          {titleExtra && <span className="truncate text-xs text-forest-700 font-medium flex-shrink min-w-0">{titleExtra}</span>}
          <span className={`ml-auto flex-shrink-0 text-xs ${bold ? "text-forest-700 font-semibold" : "text-gray-400"}`}>{time}</span>
        </span>
        <span className="flex items-center gap-2 mt-0.5">
          <span className={`truncate text-sm flex-1 ${bold ? "text-gray-800" : muted ? "text-gray-400" : "text-gray-500"}`}>{preview}</span>
          {mentions > 0 && (
            <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-amber-500 text-white text-[11px] font-bold flex items-center justify-center" aria-label={`${mentions} mention${mentions === 1 ? "" : "s"}`}>@</span>
          )}
          {silenced ? (unread > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-gray-200 text-gray-600 text-[11px] font-bold flex items-center justify-center">{unread > 99 ? "99+" : unread}</span>) : <UnreadBadge count={unread} />}
        </span>
      </span>
    </button>
  );
}

function SectionHeader({ title, open, onToggle, right }: { title: string; open: boolean; onToggle: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pt-5 pb-1">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-gray-500 hover:text-gray-800">
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? "" : "-rotate-90"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        {title}
      </button>
      {right}
    </div>
  );
}

function dmPreview(dm: HubDm): string {
  if (!dm.lastPreview && !dm.lastAt) return "Say hi";
  return `${dm.lastIsMine ? "You: " : ""}${dm.lastPreview ?? ""}`;
}

function projectPreview(p: HubProject): string {
  if (!p.lastAt) return p.teamLeadName ? `Lead: ${p.teamLeadName}` : "No messages yet";
  return `${p.lastIsMine ? "You" : (p.lastAuthorName ?? "").split(" ")[0]}: ${p.lastPreview ?? ""}`;
}

function ConversationList({ data, loading, error, me, selectedKey, onOpen, onCompose, onSettings, onRetry }: {
  onSettings: () => void;
  data: HubData | null;
  loading: boolean;
  error: string;
  me: Me;
  selectedKey: string | null;
  onOpen: (key: string) => void;
  onCompose: () => void;
  onRetry: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [q, setQ] = useState("");
  const [openDms, setOpenDms] = useState(true);
  const [openProjects, setOpenProjects] = useState(true);
  const query = q.trim().toLowerCase();
  const personById = useMemo(() => new Map((data?.people ?? []).map((p) => [p.id, p])), [data]);

  const dms = useMemo(() => (data?.dms ?? []).filter((d) => {
    const p = personById.get(d.otherUserId);
    if (filter === "unread" && d.unread === 0) return false;
    if (filter === "mentions") return false;
    if (!query) return true;
    return (p?.name ?? "").toLowerCase().includes(query) || (p?.leads ?? []).some((l) => l.name.toLowerCase().includes(query));
  }), [data, personById, filter, query]);

  // Searching also finds people you haven't messaged yet
  const newPeople: HubPerson[] = useMemo(() => {
    if (!query || !data) return [];
    const existing = new Set(data.dms.map((d) => d.otherUserId));
    return data.people.filter((p) => !existing.has(p.id) && (p.name.toLowerCase().includes(query) || p.leads.some((l) => l.name.toLowerCase().includes(query)))).slice(0, 5);
  }, [data, query]);

  const statusCounts = useMemo(() => {
    const c: Record<ProjectStatus, number> = { active: 0, consignment: 0, "not-signed": 0, archived: 0 };
    for (const p of data?.projects ?? []) c[p.status]++;
    return c;
  }, [data]);

  const projects = useMemo(() => (data?.projects ?? []).filter((p) => {
    if (!query && filter !== "mentions" && p.status !== status) return false;
    if (filter === "unread" && p.unread === 0) return false;
    if (filter === "mentions" && p.mentionsUnread === 0) return false;
    if (query && !p.name.toLowerCase().includes(query) && !(p.teamLeadName ?? "").toLowerCase().includes(query)) return false;
    return true;
  }), [data, status, filter, query]);

  const ann = data?.announcements;
  const showAnn = !!ann && (filter === "all" || (filter === "unread" && ann.unread > 0)) && (!query || "announcements".includes(query));
  const showDms = filter !== "projects" && filter !== "mentions";
  const showProjects = filter !== "dms";

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 px-3 pt-1 lg:pt-4">
        <div className="flex items-center justify-between px-1 mb-3">
          <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
          <span className="flex-1" />
          <button type="button" onClick={onSettings} aria-label="Notification settings" className="w-11 h-11 mr-1 rounded-full text-gray-500 hover:bg-gray-100 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
          </button>
          <button type="button" onClick={onCompose} aria-label="New message" className="w-11 h-11 rounded-full bg-forest-600 text-white flex items-center justify-center shadow-sm hover:bg-forest-700">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people and projects"
          aria-label="Search people and projects"
          className="w-full h-11 px-4 rounded-xl bg-gray-100 text-base sm:text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-forest-400 focus:bg-white"
        />
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Filter conversations">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`h-9 px-4 rounded-full text-sm font-semibold whitespace-nowrap border transition-colors ${filter === f.key ? "bg-gray-900 border-gray-900 text-white" : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 lg:overflow-y-auto px-1 pb-6">
        {error && !data ? (
          <div className="px-3 py-10 text-center">
            <p className="text-sm text-gray-500">{error}</p>
            <button type="button" onClick={onRetry} className="mt-2 text-sm font-semibold text-forest-700">Try again</button>
          </div>
        ) : loading && !data ? (
          <div className="px-3 pt-4 space-y-4" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-gray-100" />
                <div className="flex-1 space-y-2"><div className="h-3 w-1/3 bg-gray-100 rounded" /><div className="h-3 w-2/3 bg-gray-100 rounded" /></div>
              </div>
            ))}
          </div>
        ) : data && (
          <>
            {showAnn && ann && (
              <div className="pt-3">
                <Row
                  selected={selectedKey === ann.key}
                  unread={ann.unread}
                  onClick={() => onOpen(ann.key)}
                  icon={<AnnouncementGlyph size={40} />}
                  title="Announcements"
                  time={formatListTime(ann.lastAt)}
                  preview={ann.lastAt ? `${(ann.lastAuthorName ?? "").split(" ")[0]}: ${ann.lastPreview ?? ""}` : "Company-wide from HQ"}
                />
              </div>
            )}

            {showDms && (
              <>
                <SectionHeader title="Direct messages" open={openDms} onToggle={() => setOpenDms((v) => !v)} />
                {openDms && (
                  <>
                    {dms.map((d) => {
                      const p = personById.get(d.otherUserId);
                      const name = p?.name ?? "Unknown";
                      return (
                        <Row
                          key={d.key}
                          selected={selectedKey === d.key}
                          unread={d.unread}
                          onClick={() => onOpen(d.key)}
                          icon={<Avatar name={name} photoUrl={p?.photoUrl} size={40} />}
                          title={name}
                          titleExtra={p && p.leads.length > 0 ? leadsLabel(p.leads, 1).replace("Team Lead · ", "Lead · ") : undefined}
                          time={formatListTime(d.lastAt)}
                          preview={dmPreview(d)}
                        />
                      );
                    })}
                    {newPeople.map((p) => (
                      <Row
                        key={p.id}
                        selected={false}
                        unread={0}
                        onClick={() => onOpen(`dm:${p.id}`)}
                        icon={<Avatar name={p.name} photoUrl={p.photoUrl} size={40} />}
                        title={p.name}
                        time=""
                        preview={leadsLabel(p.leads) || "Start a conversation"}
                        muted
                      />
                    ))}
                    {dms.length === 0 && newPeople.length === 0 && (
                      <button type="button" onClick={onCompose} className="w-full text-left px-3 py-3 text-sm text-gray-500">
                        {query ? "No one matches." : filter === "unread" ? "No unread direct messages." : <>No direct messages yet. <span className="font-semibold text-forest-700">Start one</span></>}
                      </button>
                    )}
                  </>
                )}
              </>
            )}

            {showProjects && (
              <>
                <SectionHeader
                  title="Projects"
                  open={openProjects}
                  onToggle={() => setOpenProjects((v) => !v)}
                  right={!query && filter !== "mentions" && (
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                      aria-label="Project status"
                      className="h-8 pl-2 pr-7 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700"
                    >
                      {STATUS_FILTERS.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]} ({statusCounts[s]})</option>)}
                    </select>
                  )}
                />
                {openProjects && (
                  projects.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-gray-500">
                      {query ? "No projects match." : filter === "unread" ? "No unread project messages." : filter === "mentions" ? "No unread mentions. You're all caught up." : `No ${PROJECT_STATUS_LABELS[status].toLowerCase()} projects.`}
                    </p>
                  ) : projects.map((p) => (
                    <Row
                      key={p.key}
                      selected={selectedKey === p.key}
                      unread={p.unread}
                      onClick={() => onOpen(p.key)}
                      icon={<ProjectGlyph size={40} />}
                      title={p.name}
                      titleExtra={query && p.status !== "active" ? PROJECT_STATUS_LABELS[p.status] : undefined}
                      time={formatListTime(p.lastAt)}
                      preview={projectPreview(p)}
                      muted={!p.lastAt}
                      mentions={p.mentionsUnread}
                      silenced={p.notifyLevel === "none"}
                    />
                  ))
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Hub ─────────────────────────────────────────────────────────────────────

export function InboxHub({ me }: { me: Me }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedKey = searchParams.get("c");
  const compact = useIsCompact();
  const [data, setData] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [membersFor, setMembersFor] = useState<{ tenantId: string; name: string } | null>(null);
  const openedInApp = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/messages/hub");
      const d = await safeJson<HubData & { error?: string }>(res);
      if (!res.ok) throw new Error(d.error || "Couldn't load your messages");
      setData(d);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your messages");
    } finally {
      setLoading(false);
    }
  }, []);

  const fullscreenOpen = compact && !!selectedKey;

  // The list refreshes on its own while visible (and not hidden behind a
  // full-screen conversation), and whenever the app comes back.
  useEffect(() => {
    load();
    const refresh = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [load]);
  useEffect(() => {
    if (fullscreenOpen) return;
    const t = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, LIST_POLL_MS);
    return () => window.clearInterval(t);
  }, [load, fullscreenOpen]);

  const open = useCallback((key: string) => {
    setComposeOpen(false);
    setMembersFor(null);
    openedInApp.current = true;
    router.push(`/inbox?c=${encodeURIComponent(key)}`, { scroll: false });
  }, [router]);

  const back = useCallback(() => {
    if (openedInApp.current) {
      openedInApp.current = false;
      router.back();
    } else {
      router.replace("/inbox", { scroll: false });
    }
  }, [router]);

  // Android back button closes the full-screen conversation
  useBackClose(fullscreenOpen ? back : null);

  // Full-screen conversation: freeze the page underneath
  useEffect(() => {
    if (!fullscreenOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [fullscreenOpen]);

  const viewport = useVisualViewport(fullscreenOpen);
  const resolved = selectedKey ? resolveConversation(selectedKey, data, me) : null;
  const canPost = resolved?.info.kind === "announcements" ? !!data?.me.canBroadcast : true;

  const conversation = resolved && (
    <ConversationView
      key={resolved.key}
      info={resolved.info}
      me={me}
      canPost={canPost}
      canAcknowledge={!!data?.me.isManager}
      mode={compact ? "fullscreen" : "pane"}
      initialUnread={resolved.unread}
      legacyPrivateCount={resolved.project?.legacyPrivateCount}
      padBottomSafeArea={compact && !viewport?.keyboardOpen}
      onBack={compact ? back : undefined}
      onOpenMembers={resolved.info.kind === "project" ? () => setMembersFor({ tenantId: resolved.info.tenantId, name: resolved.info.title }) : undefined}
      onActivity={load}
    />
  );

  const notFound = selectedKey && data && !resolved && (
    <div className="h-full flex flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-base font-semibold text-gray-900">Conversation not available</p>
      <p className="text-sm text-gray-500">You may not be on this project&apos;s team.</p>
      <button type="button" onClick={back} className="mt-2 text-sm font-semibold text-forest-700">Back to Inbox</button>
    </div>
  );

  return (
    <>
      <div className="-mx-4 sm:mx-0 -mt-4 sm:mt-0 lg:-mt-2 lg:h-[calc(100dvh-8.5rem)] lg:min-h-[560px] lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:rounded-2xl lg:border lg:border-gray-200 lg:bg-white lg:overflow-hidden lg:shadow-sm">
        <aside className="lg:border-r lg:border-gray-200 lg:min-h-0 bg-white lg:bg-transparent">
          <ConversationList
            data={data}
            loading={loading}
            error={error}
            me={me}
            selectedKey={compact ? null : selectedKey}
            onOpen={open}
            onCompose={() => setComposeOpen(true)}
            onSettings={() => setSettingsOpen(true)}
            onRetry={() => { setLoading(true); load(); }}
          />
        </aside>
        {!compact && (
          <section className="min-h-0 min-w-0">
            {conversation || notFound || (
              <div className="h-full flex flex-col items-center justify-center gap-2 p-8 text-center bg-gray-50/50">
                <p className="text-base font-semibold text-gray-900">Pick a conversation</p>
                <p className="text-sm text-gray-500 max-w-xs">Your direct messages and project channels are on the left. Start a new one with the pencil button.</p>
              </div>
            )}
          </section>
        )}
      </div>

      {fullscreenOpen && (
        <div
          className="fixed inset-x-0 z-[60] bg-white"
          style={viewport ? { top: viewport.top, height: viewport.height } : { top: 0, bottom: 0 }}
        >
          {conversation || notFound || <div className="h-full" />}
        </div>
      )}

      {composeOpen && data && (
        <NewMessageSheet
          people={data.people}
          projects={data.projects}
          meId={me.id}
          onClose={() => setComposeOpen(false)}
          onPick={(id) => open(`dm:${id}`)}
        />
      )}
      {membersFor && (
        <MembersSheet project={membersFor} meId={me.id} onClose={() => setMembersFor(null)} onMessage={(id) => open(`dm:${id}`)} onNotifyChanged={load} />
      )}
      {settingsOpen && (
        <NotificationSettingsSheet projects={data?.projects ?? []} onClose={() => setSettingsOpen(false)} onChanged={load} />
      )}
    </>
  );
}
