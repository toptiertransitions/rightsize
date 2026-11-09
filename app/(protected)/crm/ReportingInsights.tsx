"use client";

import { useMemo } from "react";
import type { ClientContact, ClientOpportunity, CRMActivity, ReferralContact, ReferralContactStage } from "@/lib/types";
import { ctDateStr } from "@/lib/date-ct";
import { cn } from "@/lib/utils";
import { analyzeOutcome, explainOutcome, featureKeyFor, DRIVER_FEATURES, type OutcomeResult, type PartnerSample, type Signal } from "@/lib/crm-drivers";

interface Props {
  activities: CRMActivity[];
  activitiesLoading: boolean;
  opportunities: ClientOpportunity[];
  clientContacts: ClientContact[];
  referralContacts: ReferralContact[];
  partnerOwner: Map<string, string>; // referral contact id → owning rep (visible reps only)
  periodStart: string;
  periodEnd: string;
  selectedRep: string | null;
  selectedRepName: string;
}

const STAGE_ORDER: ReferralContactStage[] = ["Identified", "Met", "Agreed to Refer", "Shared Leads", "Active Referral"];

// Short periods (a week) hold too few outcomes to learn from, so the model always looks back
// at least this far from the end of the selected period
const MIN_WINDOW_DAYS = 90;

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const pct = (r: number) => `${Math.round(r * 100)}%`;

const SIGNAL_STYLE: Record<Signal, { label: string; cls: string }> = {
  strong: { label: "Clear signal", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  some: { label: "Moderate signal", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  none: { label: "No clear link", cls: "bg-gray-50 text-gray-500 border-gray-200" },
  insufficient: { label: "Too little data", cls: "bg-gray-50 text-gray-400 border-gray-200" },
};

function OutcomeCard({ title, result, phrase, compare }: {
  title: string; result: OutcomeResult; phrase: string; compare?: OutcomeResult;
}) {
  const lines = explainOutcome(result, phrase);
  const maxRate = Math.max(0.01, ...result.drivers.map(d => Math.max(d.rateWith, d.rateWithout)));
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-4">
      <div>
        <h4 className="font-semibold text-gray-900">{title}</h4>
        <p className="text-sm text-gray-500 mt-0.5">
          {result.positives} of {result.n} partners ({pct(result.baseRate)}) {phrase}
          {compare && <span className="text-gray-400"> · team {pct(compare.baseRate)}</span>}
        </p>
      </div>

      <ul className="space-y-2">
        {lines.map((l, i) => (
          <li key={i} className={cn("text-sm leading-relaxed flex gap-2", i === 0 ? "text-gray-900 font-medium" : "text-gray-600")}>
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-forest-500 flex-shrink-0" />
            {l}
          </li>
        ))}
      </ul>

      {result.enoughData && (
        <div className="space-y-2.5 pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <span>Rate with at least one vs none</span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-forest-600" />With</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-gray-300" />Without</span>
            </span>
          </div>
          {result.drivers.map(d => (
            <div key={d.plural} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3">
              <span className="text-xs text-gray-700 capitalize truncate">{d.plural}</span>
              <div className="space-y-1">
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full bg-forest-600" style={{ width: `${(d.rateWith / maxRate) * 100}%` }} />
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full bg-gray-300" style={{ width: `${(d.rateWithout / maxRate) * 100}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <span className="text-xs tabular-nums text-gray-500 w-16 text-right">{pct(d.rateWith)} / {pct(d.rateWithout)}</span>
                <span className={cn("text-[10px] border rounded-full px-1.5 py-0.5 whitespace-nowrap", SIGNAL_STYLE[d.signal].cls)}>
                  {SIGNAL_STYLE[d.signal].label}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReportingInsights({
  activities, activitiesLoading, opportunities, clientContacts, referralContacts, partnerOwner,
  periodStart, periodEnd, selectedRep, selectedRepName,
}: Props) {
  const windowStart = periodStart < addDays(periodEnd, -(MIN_WINDOW_DAYS - 1)) ? periodStart : addDays(periodEnd, -(MIN_WINDOW_DAYS - 1));

  const { team, rep, mix } = useMemo(() => {
    const inWindow = (s: string | null | undefined) => {
      const d = ctDateStr(s);
      return !!d && d >= windowStart && d <= periodEnd;
    };

    const counts = new Map<string, number[]>();
    for (const a of activities) {
      if (!a.clientContactId || !partnerOwner.has(a.clientContactId) || !inWindow(a.activityDate)) continue;
      const idx = DRIVER_FEATURES.findIndex(f => f.key === featureKeyFor(a.type));
      if (!counts.has(a.clientContactId)) counts.set(a.clientContactId, new Array(DRIVER_FEATURES.length).fill(0));
      counts.get(a.clientContactId)![idx]++;
    }

    const clientById = new Map(clientContacts.map(c => [c.id, c]));
    const referred = new Set<string>();
    for (const o of opportunities) {
      const cc = clientById.get(o.clientContactId);
      if (cc?.source === "Referral Partner" && cc.referralPartnerId && inWindow(o.createdAt)) referred.add(cc.referralPartnerId);
    }

    const all: (PartnerSample & { owner: string })[] = [];
    for (const rc of referralContacts) {
      const owner = partnerOwner.get(rc.id);
      if (!owner) continue;
      const to = STAGE_ORDER.indexOf(rc.stage);
      const from = STAGE_ORDER.indexOf(rc.previousStage as ReferralContactStage);
      all.push({
        owner,
        counts: counts.get(rc.id) ?? new Array(DRIVER_FEATURES.length).fill(0),
        progressed: inWindow(rc.stageChangedAt) && to > 0 && to > from,
        referred: referred.has(rc.id),
      });
    }

    const mine = selectedRep ? all.filter(s => s.owner === selectedRep) : null;
    const per10 = (rows: PartnerSample[]) =>
      DRIVER_FEATURES.map((_, j) => (rows.length ? (rows.reduce((s, r) => s + r.counts[j], 0) / rows.length) * 10 : 0));

    return {
      team: { progressed: analyzeOutcome(all, "progressed"), referred: analyzeOutcome(all, "referred") },
      rep: mine ? { progressed: analyzeOutcome(mine, "progressed"), referred: analyzeOutcome(mine, "referred") } : null,
      mix: mine ? { rep: per10(mine), team: per10(all), n: mine.length } : null,
    };
  }, [activities, opportunities, clientContacts, referralContacts, partnerOwner, windowStart, periodEnd, selectedRep]);

  const view = rep ?? team;

  return (
    <section className="space-y-4 pt-2">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">What&apos;s Driving Results{selectedRep ? ` · ${selectedRepName}` : ""}</h3>
        <p className="text-sm text-gray-500">
          How each kind of activity with referral partners lines up with partners moving up the funnel and sending referrals,
          {" "}{fmtDate(windowStart)} – {fmtDate(periodEnd)}.
          {selectedRep ? ` ${selectedRepName}'s partners only; click their name again to see the whole team.` : " Click a rep's name above to see theirs."}
        </p>
      </div>

      {activitiesLoading ? (
        <p className="text-sm text-gray-400">Loading activities…</p>
      ) : (
        <>
          <div className="grid lg:grid-cols-2 gap-4">
            <OutcomeCard title="Moving partners up the funnel" result={view.progressed} phrase="moved up a stage" compare={rep ? team.progressed : undefined} />
            <OutcomeCard title="Getting referrals" result={view.referred} phrase="sent a referral" compare={rep ? team.referred : undefined} />
          </div>

          {mix && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h4 className="font-semibold text-gray-900">{selectedRepName}&apos;s activity mix vs team</h4>
              <p className="text-sm text-gray-500 mt-0.5 mb-3">Activities per 10 partners owned ({mix.n} partners)</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {DRIVER_FEATURES.map((f, j) => {
                  const r = mix.rep[j], t = mix.team[j];
                  const diff = t > 0 ? r / t : r > 0 ? Infinity : 1;
                  return (
                    <div key={f.key} className="rounded-lg bg-gray-50 px-3 py-2.5">
                      <div className="text-xs text-gray-500 capitalize">{f.plural}</div>
                      <div className="text-lg font-bold text-gray-900 tabular-nums">{r.toFixed(1)}</div>
                      <div className={cn("text-[11px]", diff >= 1.2 ? "text-emerald-600" : diff <= 0.8 ? "text-amber-600" : "text-gray-400")}>
                        team {t.toFixed(1)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400">
            Each partner is one data point: their meetings, events, calls, emails, texts and notes in the window, and whether they moved up a stage or sent a referral.
            A regression weighs all activity types together, so a &quot;clear signal&quot; means that type matters even after accounting for the others.
            Week and month views look back {MIN_WINDOW_DAYS} days so there&apos;s enough to learn from. This shows what goes together, not proof of cause.
          </p>
        </>
      )}
    </section>
  );
}
