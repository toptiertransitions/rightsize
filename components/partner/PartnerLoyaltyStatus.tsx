"use client";

import { useEffect, useState } from "react";
import { TIERS, TIER_COLORS, type TierName } from "@/lib/loyalty";
import type { PartnerLedgerEntry } from "@/lib/types";

interface LoyaltyData {
  currentTier: TierName;
  currentYearPoints: number;
  currentMultiplier: number;
  lifetimePoints: number;
  programYearStartDate: string;
  programYearEndDate: string;
  nextTier: TierName | null;
  pointsToNextTier: number | null;
  percentToNextTier: number | null;
  recentActivity: PartnerLedgerEntry[];
  isNew?: boolean;
}

const TIER_ICON: Record<TierName, string> = {
  None: "◦",
  Silver: "★",
  Gold: "⬡",
  Platinum: "◈",
  Diamond: "◆",
};

const EVENT_LABELS: Record<string, string> = {
  project_completed: "Project",
  manual_bonus: "Bonus",
  manual_redemption: "Redemption",
  silver_one_time_bonus: "Silver Bonus",
  year_reset: "Year Reset",
};

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface Props {
  partnerId: string;
}

export function PartnerLoyaltyStatus({ partnerId }: Props) {
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEarn, setShowEarn] = useState(false);

  const load = () => {
    fetch(`/api/partner-loyalty/status?partnerId=${encodeURIComponent(partnerId)}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 animate-pulse">
        <div className="h-5 w-32 bg-gray-200 rounded mb-3" />
        <div className="h-8 w-48 bg-gray-200 rounded mb-4" />
        <div className="h-3 w-full bg-gray-100 rounded-full" />
      </div>
    );
  }

  if (!data) return null;

  const tierColor = TIER_COLORS[data.currentTier];
  const isNew = data.isNew || data.currentYearPoints === 0;

  if (isNew && data.currentTier === "None") {
    return (
      <div className="rounded-2xl border border-dashed border-[#C9A96E]/40 bg-white p-6">
        <p className="text-sm font-semibold text-[#2d4a3e] mb-1">Premier Partner Rewards</p>
        <p className="text-gray-500 text-sm">
          Start earning — your first completed project referral unlocks{" "}
          <span className="font-semibold" style={{ color: TIER_COLORS.Silver }}>Silver status</span> and a
          one-time <span className="font-semibold text-[#C9A96E]">+5 point bonus</span>.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {TIERS.filter(t => t.name !== "None").map(t => (
            <div key={t.name} className="flex items-center gap-1.5 text-xs">
              <span style={{ color: TIER_COLORS[t.name] }}>{TIER_ICON[t.name]}</span>
              <span className="font-medium" style={{ color: TIER_COLORS[t.name] }}>{t.name}</span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-500">{t.threshold} pts · {t.multiplier}×</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const currentTierThreshold = TIERS.find(t => t.name === data.currentTier)?.threshold ?? 0;
  const nextTierThreshold = data.nextTier
    ? TIERS.find(t => t.name === data.nextTier)?.threshold ?? 0
    : null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl leading-none" style={{ color: tierColor }}>
              {TIER_ICON[data.currentTier]}
            </span>
            <span className="text-2xl font-bold leading-none" style={{ color: tierColor }}>
              {data.currentTier}
            </span>
            <span
              className="ml-1 text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: `${tierColor}20`, color: tierColor }}
            >
              {data.currentMultiplier}× earning
            </span>
          </div>
          <p className="text-xs text-gray-400">
            Program Year: {data.programYearStartDate} – {data.programYearEndDate}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-3xl font-bold text-[#2d4a3e]">{data.currentYearPoints}</div>
          <div className="text-xs text-gray-400">pts this year</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-6 pb-5">
        {data.nextTier && nextTierThreshold !== null ? (
          <>
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>
                {data.currentTier !== "None" ? `${data.currentTier} (${currentTierThreshold} pts) ✓` : "Getting started"}
                {" — "}
                next: <span style={{ color: TIER_COLORS[data.nextTier] }}>{data.nextTier}</span> at {nextTierThreshold} pts
              </span>
              <span style={{ color: TIER_COLORS[data.nextTier] }}>{data.percentToNextTier}%</span>
            </div>
            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${data.percentToNextTier ?? 0}%`,
                  background: `linear-gradient(90deg, ${TIER_COLORS[data.currentTier]}, ${TIER_COLORS[data.nextTier]})`,
                }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {data.pointsToNextTier} more point{data.pointsToNextTier !== 1 ? "s" : ""} to {data.nextTier}
            </p>
          </>
        ) : (
          <div className="text-center py-2">
            <span className="text-sm font-semibold" style={{ color: tierColor }}>
              ◆ Maximum tier achieved — Diamond status
            </span>
          </div>
        )}
      </div>

      {/* How you earn (collapsible) */}
      <div className="border-t border-gray-100">
        <button
          onClick={() => setShowEarn(v => !v)}
          className="w-full px-6 py-3 text-left text-xs font-medium text-gray-500 hover:text-gray-700 flex items-center justify-between transition-colors"
        >
          How you earn
          <span className="text-gray-400">{showEarn ? "▲" : "▼"}</span>
        </button>
        {showEarn && (
          <div className="px-6 pb-5 space-y-3">
            <p className="text-xs text-gray-600">
              <span className="font-semibold">1 completed project referral</span> ={" "}
              <span style={{ color: tierColor }} className="font-semibold">{data.currentMultiplier} point{data.currentMultiplier !== 1 ? "s" : ""}</span>{" "}
              at your current <span style={{ color: tierColor }}>{data.currentTier}</span> rate
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 text-left">
                  <th className="pb-1 font-medium">Tier</th>
                  <th className="pb-1 font-medium text-right">Threshold</th>
                  <th className="pb-1 font-medium text-right">Multiplier</th>
                </tr>
              </thead>
              <tbody>
                {TIERS.map(t => (
                  <tr
                    key={t.name}
                    className={`border-t border-gray-50 ${t.name === data.currentTier ? "font-semibold" : ""}`}
                    style={t.name === data.currentTier ? { color: TIER_COLORS[t.name] } : { color: "#6b7280" }}
                  >
                    <td className="py-1">{TIER_ICON[t.name]} {t.name}</td>
                    <td className="py-1 text-right">{t.threshold} pts</td>
                    <td className="py-1 text-right">{t.multiplier}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              Multiplier activates immediately when you cross a threshold mid-year.
              Points reset June 1. Status carries into the following year.
            </p>
          </div>
        )}
      </div>

      {/* Recent activity */}
      {data.recentActivity.length > 0 && (
        <div className="border-t border-gray-100 px-6 py-4">
          <p className="text-xs font-medium text-gray-500 mb-3">Recent Activity</p>
          <div className="space-y-2">
            {data.recentActivity.map(entry => (
              <div key={entry.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
                    style={
                      entry.pointsDelta > 0
                        ? { background: "#dcfce7", color: "#16a34a" }
                        : { background: "#fee2e2", color: "#dc2626" }
                    }
                  >
                    {EVENT_LABELS[entry.eventType] ?? entry.eventType}
                  </span>
                  <span className="text-xs text-gray-500 truncate">{entry.note || "—"}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className="text-xs font-semibold tabular-nums"
                    style={{ color: entry.pointsDelta > 0 ? "#16a34a" : "#dc2626" }}
                  >
                    {entry.pointsDelta > 0 ? "+" : ""}{entry.pointsDelta}
                  </span>
                  <span className="text-[10px] text-gray-400 tabular-nums w-14 text-right">
                    {fmtDate(entry.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
