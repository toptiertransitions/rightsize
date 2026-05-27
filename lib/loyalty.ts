export type TierName = "None" | "Silver" | "Gold" | "Platinum" | "Diamond";
export type LedgerEventType =
  | "project_completed"
  | "manual_bonus"
  | "manual_redemption"
  | "silver_one_time_bonus"
  | "year_reset";

export const TIERS: { name: TierName; threshold: number; multiplier: number }[] = [
  { name: "None",     threshold: 0,   multiplier: 1 },
  { name: "Silver",   threshold: 10,  multiplier: 1 },
  { name: "Gold",     threshold: 25,  multiplier: 2 },
  { name: "Platinum", threshold: 75,  multiplier: 3 },
  { name: "Diamond",  threshold: 150, multiplier: 4 },
];

export function getTierForPoints(points: number): typeof TIERS[0] {
  return [...TIERS].reverse().find(t => points >= t.threshold) ?? TIERS[0];
}

export function getTierIndex(name: TierName): number {
  return TIERS.findIndex(t => t.name === name);
}

export function getNextTier(currentTier: TierName): typeof TIERS[0] | null {
  const idx = getTierIndex(currentTier);
  return idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
}

export function getPointsToNextTier(currentPoints: number, currentTier: TierName): number | null {
  const next = getNextTier(currentTier);
  return next ? Math.max(0, next.threshold - currentPoints) : null;
}

export function getPercentToNextTier(currentPoints: number, currentTier: TierName): number | null {
  const next = getNextTier(currentTier);
  if (!next) return null;
  const tierData = TIERS.find(t => t.name === currentTier)!;
  const range = next.threshold - tierData.threshold;
  const progress = currentPoints - tierData.threshold;
  return Math.min(100, Math.max(0, Math.round((progress / range) * 100)));
}

export function getCurrentProgramYear(): number {
  const now = new Date();
  return now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
}

export function isProgramYearReset(lastYear: number): boolean {
  return getCurrentProgramYear() > lastYear;
}

export function getProgramYearLabel(year: number): { start: string; end: string } {
  return {
    start: `June 1, ${year}`,
    end: `May 31, ${year + 1}`,
  };
}

export const TIER_COLORS: Record<TierName, string> = {
  None:     "#6B7280",
  Silver:   "#9CA3AF",
  Gold:     "#C9A96E",
  Platinum: "#378ADD",
  Diamond:  "#7F77DD",
};
