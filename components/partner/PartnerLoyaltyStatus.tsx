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

// Benefit text shown when a partner is approaching each tier
const TIER_BENEFIT: Partial<Record<TierName, string>> = {
  Silver: "Reach Silver and unlock a one-time +5 point bonus",
  Gold: "Gold doubles your earning rate — 2× points on every referral",
  Platinum: "Platinum triples your earning rate — 3× points on every referral",
  Diamond: "Diamond is the maximum tier — earn 4× points on every referral",
};

// Shorter label for the tier ladder preview
const TIER_PERK: Partial<Record<TierName, string>> = {
  Silver: "+5 one-time bonus at Silver milestone",
  Gold: "2× points per referral",
  Platinum: "3× points per referral",
  Diamond: "4× points per referral — maximum",
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
  compact?: boolean;
}

export function PartnerLoyaltyStatus({ partnerId, compact = false }: Props) {
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
  const nextTierColor = data.nextTier ? TIER_COLORS[data.nextTier] : tierColor;
  const isNew = data.isNew || (data.currentTier === "None" && data.currentYearPoints === 0);
  const isDiamond = data.currentTier === "Diamond";
  const currentTierThreshold = TIERS.find(t => t.name === data.currentTier)?.threshold ?? 0;
  const nextTierThreshold = data.nextTier
    ? TIERS.find(t => t.name === data.nextTier)?.threshold ?? 0
    : null;
  const referralsNeeded =
    data.pointsToNextTier && data.currentMultiplier
      ? Math.ceil(data.pointsToNextTier / data.currentMultiplier)
      : null;

  // ── Onboarding: no points yet ─────────────────────────────────────────────
  if (isNew) {
    if (compact) {
      return (
        <div className="rounded-2xl border border-[#C9A96E]/30 bg-gradient-to-br from-[#fdfaf5] to-white px-5 py-4">
          <p className="text-xs font-semibold text-[#2d4a3e] uppercase tracking-wider mb-2">
            Premier Partner Rewards
          </p>
          <p className="text-sm text-gray-600">
            Every completed project referral earns points toward higher tiers.{" "}
            <span className="font-semibold text-gray-800">10 referrals</span> reaches{" "}
            <span className="font-semibold" style={{ color: TIER_COLORS.Silver }}>Silver</span> and unlocks a
            one-time <span className="font-semibold" style={{ color: TIER_COLORS.Gold }}>+5 bonus</span>.{" "}
            <span className="font-semibold text-gray-800">25 points</span> reaches{" "}
            <span className="font-semibold" style={{ color: TIER_COLORS.Gold }}>Gold</span> — every referral
            earns <span className="font-semibold">2× points</span> from there.
          </p>
          <a href="/partner/loyalty" className="inline-block mt-3 text-xs font-medium text-[#2d4a3e] hover:underline">
            View full tier details &rarr;
          </a>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-[#C9A96E]/30 bg-gradient-to-br from-[#fdfaf5] to-white overflow-hidden">
        <div className="px-6 py-5">
          <p className="text-xs font-semibold text-[#2d4a3e] uppercase tracking-wider mb-1">
            Premier Partner Rewards
          </p>
          <h3 className="text-lg font-bold text-gray-900">Start your journey to Diamond</h3>
          <p className="text-sm text-gray-500 mt-1">
            Every completed project referral earns points. Higher tiers unlock faster earning rates.
          </p>
        </div>

        {/* First milestone callout */}
        <div className="mx-4 mb-4 rounded-xl p-4" style={{ background: `${TIER_COLORS.Silver}10`, border: `1px solid ${TIER_COLORS.Silver}30` }}>
          <div className="flex items-start gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-sm"
              style={{ background: `${TIER_COLORS.Silver}20`, color: TIER_COLORS.Silver }}
            >
              ★
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                First goal: <span style={{ color: TIER_COLORS.Silver }}>Silver status</span>
              </p>
              <p className="text-sm text-gray-500 mt-0.5">
                Complete 10 referrals to reach Silver and unlock a one-time{" "}
                <span className="font-semibold" style={{ color: TIER_COLORS.Gold }}>+5 point bonus</span>.
                At 25 points you hit{" "}
                <span className="font-semibold" style={{ color: TIER_COLORS.Gold }}>Gold</span> — every
                referral earns <span className="font-semibold">2× points</span> from there.
              </p>
            </div>
          </div>
        </div>

        {/* Tier ladder */}
        <div className="px-6 pb-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Full tier ladder</p>
          <div className="relative">
            <div className="absolute left-4 top-4 bottom-4 w-px bg-gray-100" />
            <div className="space-y-4">
              {TIERS.map(t => (
                <div key={t.name} className="flex items-start gap-4 relative">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 relative z-10 bg-white text-sm"
                    style={{
                      borderColor: t.name === "None" ? "#E5E7EB" : TIER_COLORS[t.name as TierName],
                      color: t.name === "None" ? "#9CA3AF" : TIER_COLORS[t.name as TierName],
                    }}
                  >
                    {TIER_ICON[t.name as TierName]}
                  </div>
                  <div className="pt-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-sm font-semibold"
                        style={{ color: t.name === "None" ? "#6B7280" : TIER_COLORS[t.name as TierName] }}
                      >
                        {t.name === "None" ? "Starting" : t.name}
                      </span>
                      {t.threshold > 0 && (
                        <span className="text-xs text-gray-400">{t.threshold} pts</span>
                      )}
                      <span
                        className="text-xs font-medium px-1.5 py-0.5 rounded-full"
                        style={{
                          background: t.name === "None" ? "#F3F4F6" : `${TIER_COLORS[t.name as TierName]}15`,
                          color: t.name === "None" ? "#6B7280" : TIER_COLORS[t.name as TierName],
                        }}
                      >
                        {t.multiplier}× per referral
                      </span>
                    </div>
                    {TIER_PERK[t.name as TierName] && (
                      <p className="text-xs text-gray-400 mt-0.5">{TIER_PERK[t.name as TierName]}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Diamond max tier ───────────────────────────────────────────────────────
  if (isDiamond) {
    return (
      <div className="rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, #4c1d95 0%, #7F77DD 100%)" }}>
        <div className="px-6 py-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-wider opacity-60 mb-2">
            Premier Partner Rewards
          </p>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <span className="text-4xl">{TIER_ICON.Diamond}</span>
            <span className="text-3xl font-bold">Diamond</span>
            <span className="text-sm font-semibold px-2.5 py-1 rounded-full bg-white/20">
              4× earning
            </span>
          </div>
          <p className="text-white/75 text-sm">Maximum tier — every referral earns 4× points.</p>
          <div className="mt-4 flex items-center gap-5 text-sm">
            <div>
              <div className="text-2xl font-bold">{data.currentYearPoints}</div>
              <div className="text-white/50 text-xs">pts this year</div>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div>
              <div className="text-2xl font-bold">{data.lifetimePoints}</div>
              <div className="text-white/50 text-xs">lifetime pts</div>
            </div>
          </div>
        </div>

        {data.recentActivity.length > 0 && (
          <div className="bg-black/20 px-6 py-4">
            <p className="text-xs font-medium text-white/50 mb-3">Recent Activity</p>
            <div className="space-y-2">
              {data.recentActivity.slice(0, 5).map(entry => (
                <div key={entry.id} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-white/65 truncate">{entry.note || EVENT_LABELS[entry.eventType] || "—"}</span>
                  <span className="text-xs font-semibold text-white tabular-nums shrink-0">
                    {entry.pointsDelta > 0 ? "+" : ""}{entry.pointsDelta} · {fmtDate(entry.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Active progress (airline boarding-pass style) ─────────────────────────
  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {/* Current tier header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">
            Premier Partner Rewards
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl leading-none" style={{ color: tierColor }}>
              {TIER_ICON[data.currentTier]}
            </span>
            <span className="text-xl font-bold" style={{ color: tierColor }}>
              {data.currentTier}
            </span>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: `${tierColor}18`, color: tierColor }}
            >
              {data.currentMultiplier}× earning
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-3xl font-bold" style={{ color: tierColor }}>
            {data.currentYearPoints}
          </div>
          <div className="text-xs text-gray-400">pts this year</div>
        </div>
      </div>

      {/* Airline-style "X away from Y" CTA strip */}
      {data.nextTier && nextTierThreshold !== null && data.pointsToNextTier !== null && (
        <div
          className="mx-4 mb-4 rounded-xl p-4"
          style={{
            background: `linear-gradient(135deg, ${nextTierColor}0d 0%, ${nextTierColor}1a 100%)`,
            border: `1px solid ${nextTierColor}35`,
          }}
        >
          {/* The headline — most prominent element */}
          <div className="flex items-baseline gap-2 flex-wrap mb-1">
            <span className="text-3xl font-extrabold tabular-nums" style={{ color: nextTierColor }}>
              {data.pointsToNextTier}
            </span>
            <span className="text-base font-semibold text-gray-700">
              point{data.pointsToNextTier !== 1 ? "s" : ""} away from
            </span>
            <span className="text-2xl font-bold" style={{ color: nextTierColor }}>
              {TIER_ICON[data.nextTier]} {data.nextTier}
            </span>
          </div>

          {/* Benefit line */}
          {TIER_BENEFIT[data.nextTier] && (
            <p className="text-sm text-gray-600 mb-2.5">{TIER_BENEFIT[data.nextTier]}</p>
          )}

          {/* Referrals estimate */}
          {referralsNeeded !== null && (
            <p className="text-xs text-gray-500 mb-3">
              ≈{" "}
              <span className="font-semibold text-gray-700">
                {referralsNeeded} more referral{referralsNeeded !== 1 ? "s" : ""}
              </span>{" "}
              at your current {data.currentMultiplier}× rate
            </p>
          )}

          {/* Progress bar */}
          <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: `${nextTierColor}18` }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(data.percentToNextTier ?? 0, 100)}%`,
                background: `linear-gradient(90deg, ${tierColor}, ${nextTierColor})`,
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] mt-1.5">
            <span style={{ color: tierColor }}>
              {currentTierThreshold === 0 ? "Start" : `${currentTierThreshold} pts`}
            </span>
            <span className="font-semibold" style={{ color: nextTierColor }}>
              {nextTierThreshold} pts · {data.nextTier}
            </span>
          </div>
        </div>
      )}

      {/* How you earn (collapsible) */}
      <div className="border-t border-gray-100">
        <button
          onClick={() => setShowEarn(v => !v)}
          className="w-full px-6 py-3 text-left text-xs font-medium text-gray-500 hover:text-gray-700 flex items-center justify-between transition-colors"
        >
          How you earn
          <span className="text-[10px] text-gray-400">{showEarn ? "▲" : "▼"}</span>
        </button>
        {showEarn && (
          <div className="px-6 pb-5 space-y-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 text-left">
                  <th className="pb-1 font-medium">Tier</th>
                  <th className="pb-1 font-medium text-right">At</th>
                  <th className="pb-1 font-medium text-right">Points / referral</th>
                </tr>
              </thead>
              <tbody>
                {TIERS.map(t => {
                  const isCurrent = t.name === data.currentTier;
                  return (
                    <tr
                      key={t.name}
                      className={`border-t border-gray-50 ${isCurrent ? "font-semibold" : ""}`}
                      style={{ color: isCurrent ? TIER_COLORS[t.name as TierName] : "#9ca3af" }}
                    >
                      <td className="py-1.5">
                        {TIER_ICON[t.name as TierName]} {t.name === "None" ? "Starting" : t.name}
                        {isCurrent && <span className="ml-1 text-[10px] opacity-60">← you</span>}
                      </td>
                      <td className="py-1.5 text-right">{t.threshold === 0 ? "—" : `${t.threshold} pts`}</td>
                      <td className="py-1.5 text-right">{t.multiplier}×</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              Silver milestone: one-time +5 bonus when you first reach 10 pts.
              Multiplier upgrades apply immediately. Points reset June 1; status carries into the next year.
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

      {/* Program year */}
      <div className="border-t border-gray-100 px-6 py-2.5">
        <p className="text-[10px] text-gray-400">
          Program Year: {data.programYearStartDate} – {data.programYearEndDate}
        </p>
      </div>
    </div>
  );
}
