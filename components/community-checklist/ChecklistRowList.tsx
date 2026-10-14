"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { dueRuleLabel, formatYmd, todayYmd, ymdInChicago, type ResidentChecklistRow } from "@/lib/checklists/shared";

export function StatusPill({ row }: { row: ResidentChecklistRow }) {
  if (row.status === "done") {
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-forest-700 bg-forest-50 border border-forest-100 rounded-full px-2 py-0.5"><Check className="w-3 h-3" strokeWidth={3} /> Done</span>;
  }
  if (row.status === "pastDue") {
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-100 rounded-full px-2 py-0.5"><AlertCircle className="w-3 h-3" /> Past due</span>;
  }
  if (row.dueSoon) {
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5"><Clock className="w-3 h-3" /> Due soon</span>;
  }
  return <span className="inline-flex items-center text-[11px] font-semibold text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">Open</span>;
}

function dueText(row: ResidentChecklistRow): string {
  if (row.dueDate) {
    const today = todayYmd();
    const label = formatYmd(row.dueDate, row.dueDate.slice(0, 4) !== today.slice(0, 4));
    if (row.status === "done") return `Due ${label}`;
    return row.dueDate === today ? "Due today" : `Due ${label}`;
  }
  if (row.waitingOnMoveDate) return `${dueRuleLabel(row.item)} (move date not set)`;
  return "No due date";
}

/** A resident's checklist items, each with its status, due date and who finished it. */
export function ChecklistRowList({
  rows,
  canToggle,
  onToggle,
  accent,
}: {
  rows: ResidentChecklistRow[];
  canToggle: boolean;
  onToggle: (itemId: string, done: boolean) => Promise<{ ok: boolean; error?: string }>;
  /** Community brand color for the checkboxes */
  accent?: string;
}) {
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [openDetails, setOpenDetails] = useState<string | null>(null);
  const [, start] = useTransition();

  function toggle(row: ResidentChecklistRow) {
    const next = !(optimistic[row.item.id] ?? row.status === "done");
    setOptimistic((o) => ({ ...o, [row.item.id]: next }));
    setBusy(row.item.id);
    setError("");
    start(async () => {
      const r = await onToggle(row.item.id, next);
      setBusy(null);
      if (!r.ok) {
        setOptimistic((o) => { const c = { ...o }; delete c[row.item.id]; return c; });
        setError(r.error ?? "That didn't save.");
      }
    });
  }

  return (
    <div>
      <ul className="divide-y divide-cream-100">
        {rows.map((row) => {
          const done = optimistic[row.item.id] ?? row.status === "done";
          const shown: ResidentChecklistRow = done === (row.status === "done") ? row : { ...row, status: done ? "done" : row.dueDate && row.dueDate < todayYmd() ? "pastDue" : "open" };
          const expanded = openDetails === row.item.id;
          return (
            <li key={row.item.id} className={cn("flex items-start gap-3 py-3", busy === row.item.id && "opacity-70")}>
              <button
                type="button"
                role="checkbox"
                aria-checked={done}
                aria-label={done ? `Mark "${row.item.title}" not done` : `Mark "${row.item.title}" done`}
                disabled={!canToggle || busy === row.item.id}
                onClick={() => toggle(row)}
                className={cn(
                  "mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                  done ? "border-transparent" : "border-gray-300 bg-white",
                  canToggle ? "cursor-pointer hover:border-gray-400" : "cursor-default"
                )}
                style={done ? { backgroundColor: accent || "#2E6B4F" } : undefined}
              >
                {done && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className={cn("text-sm font-medium", done ? "text-gray-400 line-through decoration-gray-300" : "text-gray-900")}>{row.item.title}</p>
                  <StatusPill row={shown} />
                </div>
                <p className={cn("text-xs mt-0.5", shown.status === "pastDue" ? "text-red-600" : "text-gray-500")}>
                  {dueText(row)}
                  {done && row.state?.doneByName && row.status === "done" && (
                    <> · Done by {row.state.doneByName}{row.state.doneByRole ? ` (${row.state.doneByRole})` : ""}{row.state.doneAt ? ` on ${formatYmd(ymdInChicago(row.state.doneAt))}` : ""}</>
                  )}
                </p>
                {row.item.details && (
                  <>
                    <button type="button" onClick={() => setOpenDetails(expanded ? null : row.item.id)} className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-gray-500 hover:text-gray-800">
                      Details <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} />
                    </button>
                    {expanded && <p className="mt-1.5 text-sm text-gray-600 whitespace-pre-wrap leading-relaxed bg-cream-50 rounded-lg px-3 py-2">{row.item.details}</p>}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-red-600 mt-2" role="alert">{error}</p>}
    </div>
  );
}
