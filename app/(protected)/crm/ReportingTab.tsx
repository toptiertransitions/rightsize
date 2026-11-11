"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import type { ClientContact, ClientOpportunity, CRMActivity, ReferralCompany, ReferralContact, ReferralContactStage, StaffMember } from "@/lib/types";
import { ctDateStr, ctToday } from "@/lib/date-ct";
import { cn } from "@/lib/utils";
import ReportingInsights from "./ReportingInsights";

interface Props {
  opportunities: ClientOpportunity[];
  clientContacts: ClientContact[];
  referralContacts: ReferralContact[];
  companies: ReferralCompany[];
  staffMembers: StaffMember[];
  currentUserId: string;
  onViewOpportunity: (oppId: string) => void;
}

type Period = "7d" | "30d" | "week" | "month" | "lastMonth" | "quarter" | "custom";

const PERIODS: { id: Period; label: string }[] = [
  { id: "7d", label: "Rolling 7 Days" },
  { id: "30d", label: "Rolling 30 Days" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "lastMonth", label: "Last Month" },
  { id: "quarter", label: "This Quarter" },
  { id: "custom", label: "Custom" },
];

// Forward order of the referral funnel; Inactive is a drop-out, never a progression
const STAGE_ORDER: ReferralContactStage[] = ["Identified", "Met", "Agreed to Refer", "Shared Leads", "Active Referral"];

// Admin and test accounts, hidden from the board (and its totals)
const EXCLUDE_REP_NAMES = ["MattTest", "Julie Johnstone", "Matt Kamhi"];
const isExcluded = (name: string) => EXCLUDE_REP_NAMES.some(n => name.startsWith(n));

// ─── Date helpers (YYYY-MM-DD strings, Central time) ─────────────────────────

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// m is 1-based and may be 0 (previous December); Date.UTC normalizes it
function firstOfMonth(y: number, m: number): string {
  return new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
}
function lastOfMonth(y: number, m: number): string {
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function periodRange(period: Exclude<Period, "custom">, today: string): { start: string; end: string } {
  const [y, m, d] = today.split("-").map(Number);
  if (period === "7d") return { start: addDays(today, -6), end: today };
  if (period === "30d") return { start: addDays(today, -29), end: today };
  if (period === "week") {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const start = addDays(today, dow === 0 ? -6 : 1 - dow); // Monday
    return { start, end: addDays(start, 6) };
  }
  if (period === "month") return { start: firstOfMonth(y, m), end: lastOfMonth(y, m) };
  if (period === "lastMonth") return { start: firstOfMonth(y, m - 1), end: lastOfMonth(y, m - 1) };
  const q = Math.floor((m - 1) / 3) * 3 + 1;
  return { start: firstOfMonth(y, q), end: lastOfMonth(y, q + 2) };
}

function fmtDate(s: string | null | undefined): string {
  const ymd = ctDateStr(s);
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit", timeZone: "UTC" });
}

function fmtRange(start: string, end: string): string {
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

type MetricKey = "wonValue" | "wonCount" | "expectedValue" | "created" | "createdValue" | "uniqueMeetings" | "contactsTouched" | "activeReferrals" | "progressions";
type Section = "opps" | "partners" | "contacts";

const COLUMNS: { key: MetricKey; label: string; sub: string; money?: boolean; section: Section }[] = [
  { key: "wonValue", label: "Won $", sub: "by close date", money: true, section: "opps" },
  { key: "wonCount", label: "Won", sub: "opps closed", section: "opps" },
  { key: "expectedValue", label: "Open Pipe $", sub: "open, exp. close in period", money: true, section: "opps" },
  { key: "created", label: "Opps Created", sub: "by created date", section: "opps" },
  { key: "createdValue", label: "Pipe $ Created", sub: "by created date, any stage", money: true, section: "opps" },
  { key: "uniqueMeetings", label: "Unique Meetings", sub: "partners met, once each", section: "contacts" },
  { key: "contactsTouched", label: "Contacts Touched", sub: "unique, by activity date", section: "contacts" },
  { key: "activeReferrals", label: "Active Referral", sub: "partners right now", section: "partners" },
  { key: "progressions", label: "Stage Moves", sub: "partners advanced", section: "partners" },
];
const COLUMN = Object.fromEntries(COLUMNS.map(c => [c.key, c])) as Record<MetricKey, (typeof COLUMNS)[number]>;

interface OppRec {
  id: string; client: string; rep: string; stage: string; value: number;
  createdAt: string; closeDate: string; tags: Set<MetricKey>;
}
interface PartnerRec {
  id: string; name: string; companyId: string; company: string; rep: string; stage: string;
  previousStage: string; stageChangedAt: string; lastActivity: string; lastReferral: string; tags: Set<MetricKey>;
}
interface ContactRec {
  key: string; id: string; name: string; kind: "Client" | "Referral Partner"; company: string;
  rep: string; touches: number; meetings: number; lastTouch: string;
}

interface Selection { rep: string | null; metric: MetricKey | null }

const isPartnerMeeting = (c: ContactRec) => c.kind === "Referral Partner" && c.meetings > 0;

// ─── Sortable table ──────────────────────────────────────────────────────────

interface Col<T> { key: string; label: string; value: (r: T) => string | number; render?: (r: T) => ReactNode; right?: boolean }

function DataTable<T>({ rows, cols, rowKey, defaultSort, onRowClick, empty, compactHeaders }: {
  rows: T[]; cols: Col<T>[]; rowKey: (r: T) => string; defaultSort: string;
  onRowClick?: (r: T) => void; empty: string; compactHeaders?: boolean;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: defaultSort, dir: -1 });
  const sorted = useMemo(() => {
    const col = cols.find(c => c.key === sort.key) ?? cols[0];
    return [...rows].sort((a, b) => {
      const va = col.value(a), vb = col.value(b);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return cmp * sort.dir;
    });
  }, [rows, cols, sort]);

  if (!rows.length) return <p className="px-4 py-6 text-sm text-gray-400 text-center">{empty}</p>;
  return (
    <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-gray-50 z-10">
          <tr className="border-b border-gray-200">
            {cols.map(c => (
              <th key={c.key} className={cn("font-medium whitespace-nowrap", compactHeaders ? "px-3 py-1.5 text-xs" : "px-4 py-2.5", c.right ? "text-right" : "text-left")}>
                <button
                  onClick={() => setSort(s => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : -1 }))}
                  className={cn("hover:text-gray-900", sort.key === c.key ? "text-forest-700" : "text-gray-500")}
                >
                  {c.label}{sort.key === c.key ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr
              key={rowKey(r)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cn("border-b border-gray-100 last:border-0", onRowClick && "cursor-pointer hover:bg-gray-50")}
            >
              {cols.map(c => (
                <td key={c.key} className={cn("px-4 py-2.5 whitespace-nowrap", c.right && "text-right tabular-nums")}>
                  {c.render ? c.render(r) : c.value(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Panel({ title, count, filterLabel, children, innerRef, highlight }: {
  title: string; count: number; filterLabel: string; children: ReactNode;
  innerRef?: Ref<HTMLDivElement>; highlight: boolean;
}) {
  return (
    <div ref={innerRef} className={cn("bg-white border rounded-xl scroll-mt-4 transition-shadow", highlight ? "border-forest-300 ring-2 ring-forest-100" : "border-gray-200")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">{title} <span className="text-gray-400 font-normal">({count})</span></h3>
        <span className="text-xs text-gray-500">{filterLabel}</span>
      </div>
      {children}
    </div>
  );
}

const STAGE_BADGE: Record<string, string> = {
  Won: "bg-emerald-50 text-emerald-700",
  Lost: "bg-red-50 text-red-700",
  Proposing: "bg-amber-50 text-amber-700",
  Qualifying: "bg-sky-50 text-sky-700",
  Lead: "bg-gray-100 text-gray-700",
  "Active Referral": "bg-emerald-50 text-emerald-700",
  "Shared Leads": "bg-teal-50 text-teal-700",
  "Agreed to Refer": "bg-sky-50 text-sky-700",
  Met: "bg-indigo-50 text-indigo-700",
  Identified: "bg-gray-100 text-gray-700",
  "Inactive Referral": "bg-red-50 text-red-700",
};
const Badge = ({ text }: { text: string }) =>
  text ? <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", STAGE_BADGE[text] ?? "bg-gray-100 text-gray-700")}>{text}</span> : null;

// ─── Main ────────────────────────────────────────────────────────────────────

export default function ReportingTab({ opportunities, clientContacts, referralContacts, companies, staffMembers, currentUserId, onViewOpportunity }: Props) {
  const [period, setPeriod] = useState<Period>("30d");
  const [custom, setCustom] = useState<{ start: string; end: string }>(() => periodRange("30d", ctToday()));
  const [sortKey, setSortKey] = useState<MetricKey>("wonValue");
  const [sel, setSel] = useState<Selection>({ rep: null, metric: null });
  const [search, setSearch] = useState("");
  const [activities, setActivities] = useState<CRMActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [activitiesError, setActivitiesError] = useState(false);
  const refs = { opps: useRef<HTMLDivElement>(null), partners: useRef<HTMLDivElement>(null), contacts: useRef<HTMLDivElement>(null) };

  useEffect(() => {
    fetch("/api/crm/activities")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => setActivities(d.activities || []))
      .catch(() => setActivitiesError(true))
      .finally(() => setActivitiesLoading(false));
  }, []);

  const today = ctToday();
  // Custom: an inverted range is read as the same span, so a half-edited range never empties the board
  const { start, end } = period === "custom"
    ? (custom.start <= custom.end ? custom : { start: custom.end, end: custom.start })
    : periodRange(period, today);

  function choosePeriod(next: Period) {
    // Seed Custom with whatever range is showing, so it opens on familiar dates
    if (next === "custom" && period !== "custom") setCustom({ start, end });
    setPeriod(next);
  }

  // Every number on the board is a count/sum over these records, so a drill-down always matches the cell
  const { reps, opps, partners, contacts, partnerOwner } = useMemo(() => {
    const inPeriod = (s: string | null | undefined) => {
      const d = ctDateStr(s);
      return !!d && d >= start && d <= end;
    };

    // Owner ids are usually Clerk ids, but older writes used the Airtable staff id — accept both
    const staffById = new Map<string, StaffMember>();
    for (const s of staffMembers) {
      if (s.clerkUserId) staffById.set(s.clerkUserId, s);
      staffById.set(s.id, s);
    }
    // Unassigned and excluded owners resolve to null and drop out of the board entirely
    const resolve = (id: string | null | undefined): string | null => {
      const s = id ? staffById.get(id) : undefined;
      if (!s || isExcluded(s.displayName)) return null;
      return s.clerkUserId || s.id;
    };

    const repIds = new Set<string>();
    // Always list active sales reps, even with zero activity, so the board shows everyone
    for (const s of staffMembers) {
      if (s.isActive && s.role === "TTTSales" && !isExcluded(s.displayName)) repIds.add(s.clerkUserId || s.id);
    }

    const contactName = new Map<string, string>();
    for (const c of clientContacts) contactName.set(c.id, c.name);
    const companyById = new Map(companies.map(c => [c.id, c]));

    const opps: OppRec[] = [];
    for (const o of opportunities) {
      const rep = resolve(o.assignedToClerkId);
      if (!rep) continue;
      const tags = new Set<MetricKey>();
      const closeDate = o.wonAt || o.expectedCloseDate || "";
      if (o.stage === "Won") {
        // Fall back to expected close for Won opps that predate WonAt tracking
        if (inPeriod(closeDate)) { tags.add("wonValue"); tags.add("wonCount"); }
      } else if (o.stage !== "Lost" && inPeriod(o.expectedCloseDate)) {
        tags.add("expectedValue");
      }
      if (inPeriod(o.createdAt)) { tags.add("created"); tags.add("createdValue"); }
      if (!tags.size) continue;
      repIds.add(rep);
      opps.push({
        id: o.id, client: contactName.get(o.clientContactId) || "(no contact)", rep, stage: o.stage,
        value: o.estimatedValue || 0, createdAt: o.createdAt, closeDate: o.lostAt || closeDate, tags,
      });
    }

    // Last Referral: newest opp whose client was referred by this partner (any date, any owner)
    const lastReferral = new Map<string, string>();
    const clientById = new Map(clientContacts.map(c => [c.id, c]));
    for (const o of opportunities) {
      const cc = clientById.get(o.clientContactId);
      if (cc?.source !== "Referral Partner" || !cc.referralPartnerId) continue;
      const d = ctDateStr(o.createdAt);
      if (d > (lastReferral.get(cc.referralPartnerId) ?? "")) lastReferral.set(cc.referralPartnerId, d);
    }

    // Referral partners are owned through their company
    const partners: PartnerRec[] = [];
    const partnerOwner = new Map<string, string>();
    const refById = new Map<string, ReferralContact>();
    for (const rc of referralContacts) {
      refById.set(rc.id, rc);
      const co = companyById.get(rc.referralCompanyId);
      const rep = resolve(co?.assignedToClerkId);
      if (!rep) continue;
      partnerOwner.set(rc.id, rep);
      const tags = new Set<MetricKey>();
      if (rc.stage === "Active Referral") tags.add("activeReferrals");
      if (inPeriod(rc.stageChangedAt)) {
        const to = STAGE_ORDER.indexOf(rc.stage);
        const from = STAGE_ORDER.indexOf(rc.previousStage as ReferralContactStage);
        // A move up the funnel; a first stage set (no previous) beyond Identified counts too
        if (to > 0 && to > from) tags.add("progressions");
      }
      if (!tags.size) continue;
      repIds.add(rep);
      partners.push({
        id: rc.id, name: rc.name, companyId: rc.referralCompanyId, company: co?.name ?? "", rep, stage: rc.stage,
        previousStage: rc.previousStage ?? "", stageChangedAt: rc.stageChangedAt ?? "", lastActivity: rc.lastActivityDate ?? "", lastReferral: lastReferral.get(rc.id) ?? "", tags,
      });
    }

    // Unique contacts touched: client or referral contact on each activity (or the
    // opportunity's client), credited to whoever logged the activity
    const oppContact = new Map(opportunities.map(o => [o.id, o.clientContactId]));
    const touched = new Map<string, ContactRec>();
    for (const a of activities) {
      if (!inPeriod(a.activityDate)) continue;
      const id = a.clientContactId || (a.opportunityId ? oppContact.get(a.opportunityId) : undefined);
      const rep = resolve(a.createdByClerkId);
      if (!id || !rep) continue;
      const key = `${rep}|${id}`;
      let rec = touched.get(key);
      if (!rec) {
        const ref = refById.get(id);
        rec = {
          key, id, rep, touches: 0, meetings: 0, lastTouch: "",
          name: ref?.name ?? contactName.get(id) ?? "(unknown contact)",
          kind: ref ? "Referral Partner" : "Client",
          company: ref ? companyById.get(ref.referralCompanyId)?.name ?? "" : "",
        };
        touched.set(key, rec);
      }
      rec.touches++;
      if (a.type === "Meeting") rec.meetings++;
      const d = ctDateStr(a.activityDate);
      if (d > rec.lastTouch) rec.lastTouch = d;
      repIds.add(rep);
    }

    const reps = [...repIds].map(id => ({ id, name: staffById.get(id)?.displayName ?? "Unknown" }));
    return { reps, opps, partners, contacts: [...touched.values()], partnerOwner };
  }, [opportunities, clientContacts, referralContacts, companies, staffMembers, activities, start, end]);

  const repName = useMemo(() => new Map(reps.map(r => [r.id, r.name])), [reps]);

  function metricValue(key: MetricKey, rep: string | null): number {
    const mine = <T extends { rep: string }>(rs: T[]) => (rep ? rs.filter(r => r.rep === rep) : rs);
    if (key === "contactsTouched") return mine(contacts).length;
    // Each referral partner met at least once counts one, however many meetings
    if (key === "uniqueMeetings") return mine(contacts).filter(isPartnerMeeting).length;
    if (COLUMN[key].section === "partners") return mine(partners).filter(p => p.tags.has(key)).length;
    const tagged = mine(opps).filter(o => o.tags.has(key));
    return COLUMN[key].money ? tagged.reduce((s, o) => s + o.value, 0) : tagged.length;
  }

  const rows = useMemo(() =>
    reps.map(r => ({ ...r, values: Object.fromEntries(COLUMNS.map(c => [c.key, metricValue(c.key, r.id)])) as Record<MetricKey, number> })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reps, opps, partners, contacts]);

  const sorted = useMemo(() =>
    [...rows].sort((a, b) => b.values[sortKey] - a.values[sortKey] || a.name.localeCompare(b.name)),
    [rows, sortKey]);

  const leaders = useMemo(() => {
    const out = {} as Record<MetricKey, number>;
    for (const c of COLUMNS) out[c.key] = Math.max(0, ...rows.map(r => r.values[c.key]));
    return out;
  }, [rows]);

  const expectedCount = (rep: string | null) => opps.filter(o => o.tags.has("expectedValue") && (!rep || o.rep === rep)).length;

  // ── Drill-down ──
  function pick(next: Selection) {
    const same = next.rep === sel.rep && next.metric === sel.metric;
    const s = same ? { rep: null, metric: null } : next;
    setSel(s);
    const section = s.metric ? COLUMN[s.metric].section : null;
    if (section) setTimeout(() => refs[section].current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  const q = search.trim().toLowerCase();
  const matches = (...fields: string[]) => !q || fields.some(f => f.toLowerCase().includes(q));
  const byRep = <T extends { rep: string }>(r: T) => !sel.rep || r.rep === sel.rep;
  const metricFor = (section: Section) => (sel.metric && COLUMN[sel.metric].section === section ? sel.metric : null);

  const oppMetric = metricFor("opps");
  const shownOpps = opps.filter(o => byRep(o) && (!oppMetric || o.tags.has(oppMetric)) && matches(o.client, repName.get(o.rep) ?? "", o.stage));
  const partnerMetric = metricFor("partners");
  const shownPartners = partners.filter(p => byRep(p) && (!partnerMetric || p.tags.has(partnerMetric)) && matches(p.name, p.company, repName.get(p.rep) ?? "", p.stage));
  const shownContacts = contacts.filter(c => byRep(c) && (sel.metric !== "uniqueMeetings" || isPartnerMeeting(c)) && matches(c.name, c.company, repName.get(c.rep) ?? "", c.kind));

  const filterLabel = (section: Section, fallback: string) => {
    const parts = [sel.rep ? repName.get(sel.rep) : "All reps", metricFor(section) ? COLUMN[metricFor(section)!].label : fallback];
    return parts.join(" · ");
  };

  const oppValueTotal = shownOpps.reduce((s, o) => s + o.value, 0);

  const repCell = (rep: string) => repName.get(rep) ?? "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Activity and Progress Leaderboard</h2>
          <p className="text-sm text-gray-500">{fmtRange(start, end)} · click any number to see the records behind it</p>
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-2">
          <div className="inline-flex flex-wrap rounded-lg border border-gray-200 bg-white p-0.5">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => choosePeriod(p.id)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  period === p.id ? "bg-forest-600 text-white" : "text-gray-600 hover:text-gray-900"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {period === "custom" && (
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
              <label className="sr-only" htmlFor="report-start">Start date</label>
              <input
                id="report-start"
                type="date"
                value={custom.start}
                max={custom.end || undefined}
                onChange={e => e.target.value && setCustom(c => ({ ...c, start: e.target.value }))}
                className="bg-transparent text-sm text-gray-800 focus:outline-none [color-scheme:light]"
              />
              <span className="text-gray-300">→</span>
              <label className="sr-only" htmlFor="report-end">End date</label>
              <input
                id="report-end"
                type="date"
                value={custom.end}
                min={custom.start || undefined}
                onChange={e => e.target.value && setCustom(c => ({ ...c, end: e.target.value }))}
                className="bg-transparent text-sm text-gray-800 focus:outline-none [color-scheme:light]"
              />
              <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">
                {Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1}d
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Team totals — click to filter the tables by metric across all reps */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-3">
        {COLUMNS.map(c => {
          const active = sel.rep === null && sel.metric === c.key;
          const v = metricValue(c.key, null);
          return (
            <button
              key={c.key}
              onClick={() => pick({ rep: null, metric: c.key })}
              className={cn(
                "text-left bg-white border rounded-xl px-4 py-3 transition-colors hover:border-forest-300",
                active ? "border-forest-500 ring-2 ring-forest-100" : "border-gray-200"
              )}
            >
              <div className="text-xs font-medium text-gray-500">{c.label}</div>
              <div className="text-xl font-bold text-gray-900 mt-0.5">
                {c.section === "contacts" && activitiesLoading ? "…" : c.money ? fmt$(v) : v}
              </div>
              <div className="text-[11px] text-gray-400 leading-tight mt-0.5">
                {c.key === "expectedValue" ? `${expectedCount(null)} open opps` : c.sub}
              </div>
            </button>
          );
        })}
      </div>

      {activitiesError && (
        <p className="text-sm text-red-600">Couldn&apos;t load activities, so Contacts Touched is incomplete. Refresh to retry.</p>
      )}

      {/* Leaderboard */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left text-xs font-medium text-gray-500 px-3 py-2.5 w-10">#</th>
              <th className="text-left text-xs font-medium text-gray-500 px-3 py-2.5">Rep</th>
              {COLUMNS.map(c => (
                <th key={c.key} className="text-right align-top px-2 py-2.5">
                  <button
                    onClick={() => setSortKey(c.key)}
                    className={cn("text-xs font-medium whitespace-nowrap hover:text-gray-900", sortKey === c.key ? "text-forest-700" : "text-gray-500")}
                  >
                    {c.label}{sortKey === c.key ? " ↓" : ""}
                  </button>
                  <div className="text-[10px] leading-tight font-normal text-gray-400 max-w-[5.75rem] ml-auto">{c.sub}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const rank = i + 1;
              const isMe = r.id === currentUserId;
              const repActive = sel.rep === r.id;
              return (
                <tr key={r.id} className={cn("border-b border-gray-100 last:border-0", repActive ? "bg-forest-50/70" : isMe && "bg-forest-50/30")}>
                  <td className="px-3 py-3">
                    <span className={cn(
                      "inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-semibold",
                      rank === 1 ? "bg-amber-100 text-amber-800" : rank === 2 ? "bg-gray-200 text-gray-700" : rank === 3 ? "bg-orange-100 text-orange-800" : "text-gray-400"
                    )}>
                      {rank}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <button
                      onClick={() => pick({ rep: r.id, metric: null })}
                      className={cn("font-medium hover:text-forest-700 hover:underline", repActive && sel.metric === null ? "text-forest-700 underline" : "text-gray-900")}
                    >
                      {r.name}
                    </button>
                    {isMe && <span className="ml-2 text-[10px] uppercase tracking-wide text-forest-600">You</span>}
                  </td>
                  {COLUMNS.map(c => {
                    const v = r.values[c.key];
                    const leads = v > 0 && v === leaders[c.key];
                    const loading = c.section === "contacts" && activitiesLoading;
                    const active = sel.rep === r.id && sel.metric === c.key;
                    return (
                      <td key={c.key} className="px-2 py-3 text-right tabular-nums whitespace-nowrap">
                        <button
                          onClick={() => pick({ rep: r.id, metric: c.key })}
                          disabled={loading}
                          className={cn(
                            "inline-block rounded-md px-2 py-0.5 transition-colors hover:ring-1 hover:ring-forest-400",
                            active ? "bg-forest-600 text-white font-semibold" :
                            leads ? "bg-amber-50 text-amber-800 font-semibold ring-1 ring-amber-200" :
                            v === 0 ? "text-gray-300" : "text-gray-800",
                            sortKey === c.key && !leads && !active && v > 0 && "font-semibold"
                          )}
                        >
                          {loading ? "…" : c.money ? fmt$(v) : v}
                        </button>
                        {c.key === "expectedValue" && expectedCount(r.id) > 0 && (
                          <div className="text-[10px] text-gray-400">{expectedCount(r.id)} open</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clients, partners, companies…"
          className="w-full sm:w-72 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-200"
        />
        {sel.rep && (
          <button onClick={() => setSel(s => ({ ...s, rep: null }))} className="rounded-full bg-forest-50 text-forest-700 border border-forest-200 px-3 py-1 text-xs font-medium hover:bg-forest-100">
            Rep: {repName.get(sel.rep)} ×
          </button>
        )}
        {sel.metric && (
          <button onClick={() => setSel(s => ({ ...s, metric: null }))} className="rounded-full bg-forest-50 text-forest-700 border border-forest-200 px-3 py-1 text-xs font-medium hover:bg-forest-100">
            {COLUMN[sel.metric].label} ×
          </button>
        )}
        {(sel.rep || sel.metric || search) && (
          <button onClick={() => { setSel({ rep: null, metric: null }); setSearch(""); }} className="text-xs text-gray-500 hover:text-gray-800 underline">
            Clear all
          </button>
        )}
      </div>

      <Panel
        title="Opportunities"
        count={shownOpps.length}
        filterLabel={`${filterLabel("opps", "Won, pipeline or created in period")} · ${fmt$(oppValueTotal)}`}
        innerRef={refs.opps}
        highlight={!!oppMetric}
      >
        <DataTable
          key={`opps-${oppMetric ?? "all"}`}
          rows={shownOpps}
          rowKey={o => o.id}
          defaultSort={oppMetric === "created" || oppMetric === "createdValue" ? "created" : "close"}
          onRowClick={o => onViewOpportunity(o.id)}
          empty="No opportunities match."
          cols={[
            { key: "client", label: "Client", value: o => o.client, render: o => <span className="font-medium text-gray-900">{o.client}</span> },
            { key: "rep", label: "Rep", value: o => repCell(o.rep) },
            { key: "stage", label: "Stage", value: o => o.stage, render: o => <Badge text={o.stage} /> },
            { key: "value", label: "Est. Value", value: o => o.value, render: o => fmt$(o.value), right: true },
            { key: "created", label: "Created", value: o => ctDateStr(o.createdAt), render: o => fmtDate(o.createdAt), right: true },
            { key: "close", label: "Close / Exp. Close", value: o => ctDateStr(o.closeDate), render: o => fmtDate(o.closeDate), right: true },
            {
              key: "tags", label: "Counts Toward", value: o => [...o.tags].join(","),
              render: o => (
                <span className="text-xs text-gray-500">
                  {[o.tags.has("wonCount") && "Won", o.tags.has("expectedValue") && "Open Pipe", o.tags.has("created") && "Created"].filter(Boolean).join(", ")}
                </span>
              ),
            },
          ]}
        />
      </Panel>

      <Panel
        title="Referral Partners"
        count={shownPartners.length}
        filterLabel={filterLabel("partners", "Active Referral or advanced in period")}
        innerRef={refs.partners}
        highlight={!!partnerMetric}
      >
        <DataTable
          key={`partners-${partnerMetric ?? "all"}`}
          rows={shownPartners}
          rowKey={p => p.id}
          defaultSort={partnerMetric === "activeReferrals" ? "lastActivity" : "changed"}
          onRowClick={p => p.companyId && window.open(`/crm?tab=referrals&company=${p.companyId}`, "_blank")}
          empty="No referral partners match."
          compactHeaders
          cols={[
            { key: "name", label: "Partner", value: p => p.name, render: p => <span className="font-medium text-gray-900">{p.name}</span> },
            { key: "company", label: "Company", value: p => p.company },
            { key: "rep", label: "Owner", value: p => repCell(p.rep) },
            { key: "stage", label: "Stage", value: p => p.stage, render: p => <Badge text={p.stage} /> },
            {
              key: "move", label: "Latest Move", value: p => p.previousStage,
              render: p => p.tags.has("progressions") ? <span className="text-xs text-gray-600">{p.previousStage || "New"} → {p.stage}</span> : <span className="text-gray-300">—</span>,
            },
            { key: "changed", label: "Stage Changed", value: p => ctDateStr(p.stageChangedAt), render: p => fmtDate(p.stageChangedAt), right: true },
            { key: "lastActivity", label: "Last Activity", value: p => ctDateStr(p.lastActivity), render: p => fmtDate(p.lastActivity), right: true },
            { key: "lastReferral", label: "Last Referral", value: p => p.lastReferral, render: p => p.lastReferral ? fmtDate(p.lastReferral) : <span className="text-gray-300">—</span>, right: true },
          ]}
        />
      </Panel>

      <Panel
        title="Contacts Touched"
        count={shownContacts.length}
        filterLabel={filterLabel("contacts", "Activity logged in period")}
        innerRef={refs.contacts}
        highlight={!!sel.metric && COLUMN[sel.metric].section === "contacts"}
      >
        {activitiesLoading ? (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">Loading activities…</p>
        ) : (
          <DataTable
            rows={shownContacts}
            rowKey={c => c.key}
            defaultSort="lastTouch"
            empty="No contacts match."
            cols={[
              { key: "name", label: "Contact", value: c => c.name, render: c => <span className="font-medium text-gray-900">{c.name}</span> },
              { key: "kind", label: "Type", value: c => c.kind },
              { key: "company", label: "Company", value: c => c.company },
              { key: "rep", label: "Touched By", value: c => repCell(c.rep) },
              { key: "touches", label: "Activities", value: c => c.touches, right: true },
              { key: "meetings", label: "Meetings", value: c => c.meetings, right: true },
              { key: "lastTouch", label: "Last Touch", value: c => c.lastTouch, render: c => fmtDate(c.lastTouch), right: true },
            ]}
          />
        )}
      </Panel>

      <ReportingInsights
        activities={activities}
        activitiesLoading={activitiesLoading}
        opportunities={opportunities}
        clientContacts={clientContacts}
        referralContacts={referralContacts}
        partnerOwner={partnerOwner}
        periodStart={start}
        periodEnd={end}
        selectedRep={sel.rep}
        selectedRepName={sel.rep ? repName.get(sel.rep) ?? "" : ""}
      />

      <div className="text-xs text-gray-400 space-y-1">
        <p>Opportunities are credited to the assigned rep. Won opps count on their close date, or their expected close date if no close date was recorded. Open Pipe is open opps expected to close in the period. Pipe $ Created is the value of every opp created in the period, whether it is now open, won or lost.</p>
        <p>Contacts Touched counts each client or referral contact once per rep, from activities logged in the period. Referral partners are credited to their company&apos;s owner; Active Referral is a current count, and Stage Moves counts partners whose latest stage change in the period moved them up the funnel. Unassigned records and admin/test accounts are left out.</p>
      </div>
    </div>
  );
}
