"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatYmd, type ChecklistStatus, type ChecklistSummary, type ResidentChecklistRow } from "@/lib/checklists/shared";
import { ChecklistRowList } from "./ChecklistRowList";

export interface BoardResident {
  tenantId: string;
  name: string;
  brandId: string;
  moveDate?: string;
  rows: ResidentChecklistRow[];
  summary: ChecklistSummary;
}

type StatusFilter = "all" | ChecklistStatus;

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All tasks" },
  { key: "pastDue", label: "Past due" },
  { key: "open", label: "Open" },
  { key: "done", label: "Done" },
];

// Partner portal: every resident moving into the community, with which of
// the community's checklist tasks are done, open or past due.
export function ResidentsChecklistBoard({
  residents,
  accent,
  hasChecklist,
  onToggle,
}: {
  residents: BoardResident[];
  accent?: string;
  hasChecklist: boolean;
  onToggle: (tenantId: string, itemId: string, done: boolean) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [residentId, setResidentId] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(residents.filter((r) => r.summary.pastDue > 0).slice(0, 3).map((r) => r.tenantId)));

  const totals = useMemo(() => residents.reduce(
    (acc, r) => ({ pastDue: acc.pastDue + r.summary.pastDue, open: acc.open + r.summary.open, done: acc.done + r.summary.done, residentsBehind: acc.residentsBehind + (r.summary.pastDue > 0 ? 1 : 0) }),
    { pastDue: 0, open: 0, done: 0, residentsBehind: 0 }
  ), [residents]);

  const shown = residents
    .filter((r) => residentId === "all" || r.tenantId === residentId)
    .filter((r) => !search.trim() || r.name.toLowerCase().includes(search.trim().toLowerCase()))
    .map((r) => ({ ...r, visibleRows: status === "all" ? r.rows : r.rows.filter((row) => row.status === status) }))
    .filter((r) => status === "all" || r.visibleRows.length > 0);

  const single = residentId !== "all";
  const color = accent || "#2E6B4F";

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (!hasChecklist) {
    return (
      <div className="rounded-2xl border border-dashed border-cream-300 bg-white px-6 py-10 text-center">
        <p className="font-semibold text-gray-900 mb-1">No checklist yet</p>
        <p className="text-sm text-gray-500">Once your checklist has tasks, you&rsquo;ll track each resident&rsquo;s progress here.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Stat label="Residents" value={residents.length} />
        <Stat label="Behind schedule" value={totals.residentsBehind} tone={totals.residentsBehind ? "red" : undefined} />
        <Stat label="Past-due tasks" value={totals.pastDue} tone={totals.pastDue ? "red" : undefined} />
        <Stat label="Open tasks" value={totals.open} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <label className="relative sm:w-72">
          <span className="sr-only">Filter by resident</span>
          <Users className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            value={residentId}
            onChange={(e) => setResidentId(e.target.value)}
            className="w-full h-11 pl-9 pr-8 rounded-xl border border-gray-200 bg-white text-[16px] sm:text-sm text-gray-900 appearance-none focus:outline-none focus:ring-2 focus:ring-forest-500/20 focus:border-forest-500"
          >
            <option value="all">All residents ({residents.length})</option>
            {residents.map((r) => <option key={r.tenantId} value={r.tenantId}>{r.name}</option>)}
          </select>
          <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </label>
        {!single && (
          <label className="relative flex-1">
            <span className="sr-only">Search residents</span>
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search residents"
              className="w-full h-11 pl-9 pr-3 rounded-xl border border-gray-200 bg-white text-[16px] sm:text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-500/20 focus:border-forest-500"
            />
          </label>
        )}
      </div>

      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatus(f.key)}
            className={cn(
              "h-9 px-3.5 rounded-full text-sm font-medium whitespace-nowrap border transition-colors",
              status === f.key ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            )}
          >
            {f.label}
            {f.key !== "all" && <span className={cn("ml-1.5 text-xs", status === f.key ? "text-gray-300" : "text-gray-400")}>{f.key === "pastDue" ? totals.pastDue : f.key === "open" ? totals.open : totals.done}</span>}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-cream-200 bg-white px-6 py-10 text-center text-sm text-gray-500">
          {residents.length === 0 ? "No residents yet. They show up here when a family moving into your community starts working with Top Tier." : "Nothing matches these filters."}
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => {
            const open = single || expanded.has(r.tenantId);
            const pct = r.summary.total ? Math.round((r.summary.done / r.summary.total) * 100) : 0;
            return (
              <li key={r.tenantId} className="bg-white rounded-2xl border border-cream-200 shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => !single && toggleExpanded(r.tenantId)}
                  aria-expanded={open}
                  className={cn("w-full text-left px-4 sm:px-5 py-4 flex items-center gap-4", !single && "hover:bg-cream-50/60")}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="font-semibold text-gray-900 truncate">{r.name}</p>
                      {r.summary.pastDue > 0 && <span className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-100 rounded-full px-2 py-0.5">{r.summary.pastDue} past due</span>}
                      {r.summary.total > 0 && r.summary.done === r.summary.total && <span className="text-[11px] font-semibold text-forest-700 bg-forest-50 border border-forest-100 rounded-full px-2 py-0.5">All done</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{r.moveDate ? `Move date ${formatYmd(r.moveDate, true)}` : "Move date not set yet"}</p>
                  </div>
                  <div className="w-28 sm:w-40 flex-shrink-0">
                    <p className="text-xs text-gray-600 text-right mb-1"><span className="font-semibold">{r.summary.done}</span>/{r.summary.total} done</p>
                    <div className="h-1.5 rounded-full bg-cream-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                  </div>
                  {!single && <ChevronDown className={cn("w-4 h-4 text-gray-400 flex-shrink-0 transition-transform", open && "rotate-180")} />}
                </button>
                {open && (
                  <div className="px-4 sm:px-5 pb-2 border-t border-cream-100">
                    <ChecklistRowList
                      rows={r.visibleRows}
                      canToggle
                      accent={color}
                      onToggle={async (itemId, done) => {
                        const res = await onToggle(r.tenantId, itemId, done);
                        if (res.ok) router.refresh();
                        return res;
                      }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "red" }) {
  return (
    <div className={cn("rounded-xl border bg-white px-4 py-3", tone === "red" ? "border-red-100" : "border-cream-200")}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={cn("text-2xl font-bold", tone === "red" ? "text-red-600" : "text-gray-900")}>{value}</p>
    </div>
  );
}
