// Pure function — how much of a referral fee gets credited back to the
// client as a discount on Top Tier move-management services, when a
// listing's referral terms configure one. Dollar amounts only make sense
// for a flat fee or a known transaction value; a percent-of-unknown-value
// fee has nothing to compute a dollar credit against yet, so this returns
// 0 rather than guessing.
import type { MarketplaceFeeType } from "./types";

export function computeSeniorCredit(
  feeType: MarketplaceFeeType,
  feeValue: number,
  creditToSeniorPercent: number
): number {
  if (creditToSeniorPercent <= 0 || feeValue <= 0) return 0;
  if (feeType === "flat") {
    return Math.round(feeValue * (creditToSeniorPercent / 100) * 100) / 100;
  }
  // "percent" fees are a % of a transaction whose dollar value isn't known
  // at match time (e.g. a home sale price) — no credit amount to show yet.
  return 0;
}
