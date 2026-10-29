"use client";

import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { formatYmd, type ChecklistSummary, type ResidentChecklistRow } from "@/lib/checklists/shared";
import { ChecklistRowList } from "./ChecklistRowList";

// The community's checklist on a resident's Plan page. Seen by the resident
// (client users) and Top Tier leads, managers and admins.
export function ResidentChecklistCard({
  communityName,
  logoUrl,
  accent,
  moveDate,
  rows,
  summary,
  canToggle,
  onToggle,
  refreshOnToggle = true,
}: {
  communityName: string;
  logoUrl?: string;
  accent?: string;
  moveDate?: string;
  rows: ResidentChecklistRow[];
  summary: ChecklistSummary;
  canToggle: boolean;
  onToggle: (itemId: string, done: boolean) => Promise<{ ok: boolean; error?: string }>;
  /** Re-render the page from the server after a toggle (off for previews) */
  refreshOnToggle?: boolean;
}) {
  const router = useRouter();
  const pct = summary.total ? Math.round((summary.done / summary.total) * 100) : 0;
  const color = accent || "#2E6B4F";

  return (
    <section className="mt-10 bg-white rounded-2xl border border-cream-200 shadow-sm overflow-hidden">
      <div className="h-1" style={{ backgroundColor: color }} />
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3 mb-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="w-11 h-11 rounded-xl object-contain bg-white border border-cream-200 p-1 flex-shrink-0" />
          ) : (
            <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-white" style={{ backgroundColor: color }}>
              <ClipboardCheck className="w-5 h-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-gray-900 leading-tight">{communityName} checklist</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Tasks from {communityName} to finish before and after your move{moveDate ? <> · Move date {formatYmd(moveDate, true)}</> : null}.
            </p>
          </div>
        </div>

        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-semibold text-gray-700">{summary.done} of {summary.total} done</span>
          {summary.pastDue > 0 && <span className="font-semibold text-red-600">{summary.pastDue} past due</span>}
        </div>
        <div className="h-2 rounded-full bg-cream-100 overflow-hidden mb-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>

        <ChecklistRowList
          rows={rows}
          canToggle={canToggle}
          accent={color}
          onToggle={async (itemId, done) => {
            const r = await onToggle(itemId, done);
            if (r.ok && refreshOnToggle) router.refresh();
            return r;
          }}
        />
      </div>
    </section>
  );
}
