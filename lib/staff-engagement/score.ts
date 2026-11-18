// Staff retention watch: weekly hours against each person's target, plus the
// leading signs that a part-time staffer is drifting away. Pure and
// client-safe: the Staff Goals table, the API and the AI Summary all read
// the same numbers from here, so the AI never sees anything the table doesn't.
//
// The score is deliberately simple and explainable. Every point comes with a
// plain-English reason, and the "cause" separates the two very different
// problems behind low hours:
//   - Under-scheduled: they're available and saying yes, we just aren't
//     offering enough work (fix: offer shifts)
//   - Pulling away: declining, not responding, inactive in the app or
//     cutting availability (fix: a check-in conversation)
//   - Overloaded: working past their max (fix: lighten the load)
// People with no hours in 8+ weeks and nothing coming up are set apart as
// Dormant, so they don't crowd out the people actually slipping right now.

export const WEEKS = 12; // complete weeks of history shown and scored
export const RECENT_WEEKS = 4; // "lately", compared against the 8 before

export type RiskTier = "High" | "Watch" | "Low" | "Dormant";
export type RiskCause = "Under-scheduled" | "Pulling away" | "Overloaded" | "On track" | "No target" | "Dormant";

export const DORMANT_DAYS = 56;

export interface StaffEngagementInput {
  id: string;
  name: string;
  role: string;
  hireDate?: string;
  targetWeeklyHours?: number;
  minWeeklyHours?: number;
  maxWeeklyHours?: number;
  /** Hours per complete week, oldest first (length WEEKS) */
  weeklyHours: number[];
  /** Hours so far in the current, unfinished week */
  currentWeekHours: number;
  lastHoursDate: string | null;
  /** Hours per week they say they're available (null: never set) */
  availableHours: number | null;
  timeOffDaysNext30: number;
  /** Shift invites over the last WEEKS weeks */
  invitesAccepted: number;
  invitesDeclined: number;
  /** Past shifts they never answered */
  invitesUnanswered: number;
  invitesLast4Weeks: number;
  /** Accepted shifts in the next 14 days */
  upcomingShifts: number;
  /** Last time they used the app (Clerk), ISO or null */
  lastActiveAt: string | null;
}

export interface StaffEngagement extends StaffEngagementInput {
  recentAvg: number;
  priorAvg: number;
  /** recentAvg / target, 0-1+ (null without a target) */
  pctOfTarget: number | null;
  /** recent vs prior average, e.g. -0.4 = down 40% (null when too little history) */
  trend: number | null;
  daysSinceHours: number | null;
  daysSinceActive: number | null;
  tenureDays: number | null;
  score: number;
  tier: RiskTier;
  cause: RiskCause;
  reasons: string[];
  action: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to.slice(0, 10)}T12:00:00Z`) - Date.parse(`${from.slice(0, 10)}T12:00:00Z`)) / 86_400_000);
}

export function scoreStaff(s: StaffEngagementInput, today: string): StaffEngagement {
  const recent = s.weeklyHours.slice(-RECENT_WEEKS);
  const prior = s.weeklyHours.slice(0, -RECENT_WEEKS);
  const recentAvg = round1(avg(recent));
  const priorAvg = round1(avg(prior));
  const target = s.targetWeeklyHours && s.targetWeeklyHours > 0 ? s.targetWeeklyHours : null;
  const pctOfTarget = target ? recentAvg / target : null;
  // A trend needs a real baseline: 2+ hrs/week over the earlier 8 weeks
  const trend = priorAvg >= 2 ? (recentAvg - priorAvg) / priorAvg : null;
  const daysSinceHours = s.lastHoursDate ? daysBetween(s.lastHoursDate, today) : null;
  const daysSinceActive = s.lastActiveAt ? daysBetween(s.lastActiveAt, today) : null;
  const tenureDays = s.hireDate ? daysBetween(s.hireDate, today) : null;
  const responded = s.invitesAccepted + s.invitesDeclined;
  const declineRate = responded ? s.invitesDeclined / responded : 0;
  const max = s.maxWeeklyHours && s.maxWeeklyHours > 0 ? s.maxWeeklyHours : null;

  let score = 0;
  let pullingAway = 0;
  const reasons: string[] = [];
  const add = (pts: number, reason: string, pulling = false) => {
    score += pts;
    if (pulling) pullingAway += pts;
    reasons.push(reason);
  };

  // Hours vs target, the core signal
  if (pctOfTarget != null) {
    const pct = Math.round(pctOfTarget * 100);
    if (pctOfTarget < 0.25) add(3, `${pct}% of target hours lately`);
    else if (pctOfTarget < 0.5) add(2, `${pct}% of target hours lately`);
    else if (pctOfTarget < 0.75) add(1, `${pct}% of target hours lately`);
  }
  if (trend != null && trend <= -0.25) add(trend <= -0.5 ? 2 : 1, `Down from ${priorAvg} to ${recentAvg} hrs/wk vs the 8 weeks before`);

  if (daysSinceHours == null) add(2, `No hours logged in ${WEEKS} weeks`);
  else if (daysSinceHours >= 28) add(2, `No hours logged in ${daysSinceHours} days`);
  else if (daysSinceHours >= 14) add(1, `No hours logged in ${daysSinceHours} days`);

  if (s.upcomingShifts === 0) add(1, "No accepted shifts in the next 2 weeks");

  if (s.invitesDeclined > 0 && responded >= 2 && declineRate >= 0.25) {
    add(declineRate >= 0.5 ? 2 : 1, `Declined ${s.invitesDeclined} of ${responded} shift invites`, true);
  }
  if (s.invitesUnanswered >= 2) add(1, `Never answered ${s.invitesUnanswered} shift invites`, true);

  if (daysSinceActive == null) add(1, "No app activity on record", true);
  else if (daysSinceActive >= 21) add(2, `Not in the app for ${daysSinceActive} days`, true);
  else if (daysSinceActive >= 10) add(1, `Not in the app for ${daysSinceActive} days`, true);

  if (target && s.availableHours != null && s.availableHours < target * 0.75) {
    add(1, `Availability (${round1(s.availableHours)} hrs/wk) is below target`, true);
  }
  if (s.timeOffDaysNext30 >= 10) add(s.timeOffDaysNext30 >= 20 ? 2 : 1, `${s.timeOffDaysNext30} days off in the next 30`, true);

  const overloaded = !!max && recentAvg > max;
  if (overloaded) add(2, `Averaging ${recentAvg} hrs/wk, over their ${max} hr max`);

  // The first 90 days are when people are likeliest to leave
  if (tenureDays != null && tenureDays >= 0 && tenureDays < 90 && score >= 2) add(1, `New hire (${tenureDays} days)`);

  const dormant = (daysSinceHours == null || daysSinceHours >= DORMANT_DAYS) && s.upcomingShifts === 0 && s.invitesLast4Weeks === 0;
  const tier: RiskTier = dormant ? "Dormant" : score >= 6 ? "High" : score >= 2 ? "Watch" : "Low";
  const lowHours = pctOfTarget != null ? pctOfTarget < 0.75 : recentAvg < 2;
  const cause: RiskCause =
    dormant ? "Dormant" :
    overloaded ? "Overloaded" :
    pullingAway >= 2 ? "Pulling away" :
    lowHours && target ? "Under-scheduled" :
    !target ? "No target" :
    pullingAway > 0 ? "Pulling away" : "On track";

  const action =
    cause === "Dormant" ? "Call to re-engage, or confirm they've moved on" :
    cause === "Overloaded" ? "Lighten their schedule and ask how they're holding up" :
    cause === "Pulling away" ? "Schedule a 1:1 check-in to ask what's changed" :
    cause === "Under-scheduled" ? (s.invitesLast4Weeks <= 1 ? "Invite them to more shifts; they've had few offers lately" : "Offer more shifts that fit their availability") :
    cause === "No target" ? "Set a target hours goal" :
    tier === "Low" ? "Recognize their consistency" : "Keep an eye on it";

  return {
    ...s, recentAvg, priorAvg, pctOfTarget, trend, daysSinceHours, daysSinceActive, tenureDays,
    score, tier, cause, reasons, action,
  };
}

/** The AI Summary's read (app/api/staff/engagement/summary) */
export interface StaffSummary {
  generatedAt: string;
  overview: string[];
  staff: { name: string; tier: "High" | "Middle" | "Low" | "Dormant"; why: string; action: string }[];
}
