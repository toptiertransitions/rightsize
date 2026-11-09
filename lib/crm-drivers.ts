// "What's driving results" for the CRM Reporting tab.
// One row per referral partner: how much of each activity type they received in a window, and
// whether they (a) moved up a funnel stage and (b) sent a referral in that window. A ridge-
// regularized logistic regression (IRLS) estimates each activity type's link to the outcome while
// holding the other types constant; results are turned into plain-English sentences.
// Pure functions, cheap enough to run in the browser on every filter change.

export const DRIVER_FEATURES = [
  { key: "Meeting", plural: "meetings", singular: "meeting" },
  { key: "Event", plural: "events", singular: "event" },
  { key: "Call", plural: "calls", singular: "call" },
  { key: "Email", plural: "emails", singular: "email" },
  { key: "Text Message", plural: "texts", singular: "text" },
  { key: "Other", plural: "notes and tasks", singular: "note or task" },
] as const;

export type DriverFeatureKey = (typeof DRIVER_FEATURES)[number]["key"];

export function featureKeyFor(activityType: string): DriverFeatureKey {
  return (DRIVER_FEATURES.find(f => f.key === activityType)?.key ?? "Other") as DriverFeatureKey;
}

export interface PartnerSample {
  counts: number[]; // aligned with DRIVER_FEATURES
  progressed: boolean;
  referred: boolean;
}

export type Signal = "strong" | "some" | "none" | "insufficient";

export interface DriverResult {
  index: number;
  plural: string;
  singular: string;
  oddsPerOne: number;   // multiplicative change in odds per extra activity, others held constant
  z: number;
  signal: Signal;
  rateWith: number;     // outcome rate among partners with ≥1 of this activity
  rateWithout: number;
  nWith: number;
}

export interface OutcomeResult {
  n: number;
  positives: number;
  baseRate: number;
  drivers: DriverResult[]; // sorted strongest positive first
  enoughData: boolean;
}

// Counts are capped so one heavily-emailed partner can't dominate the fit
const CAP = 10;
const MIN_POSITIVES = 5;
const MIN_WITH = 5;

function invert(m: number[][]): number[][] | null {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
    if (Math.abs(a[pivot][c]) < 1e-12) return null;
    [a[c], a[pivot]] = [a[pivot], a[c]];
    const p = a[c][c];
    for (let j = 0; j < 2 * n; j++) a[c][j] /= p;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c];
      if (f) for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[c][j];
    }
  }
  return a.map(row => row.slice(n));
}

// Logistic regression on standardized features; returns raw-scale coefficients and standard errors
function fitLogistic(X: number[][], y: number[], lambda = 1): { beta: number[]; se: number[] } | null {
  const n = X.length, k = X[0]?.length ?? 0;
  if (!n || !k) return null;
  const mean = Array.from({ length: k }, (_, j) => X.reduce((s, r) => s + r[j], 0) / n);
  const sd = Array.from({ length: k }, (_, j) => Math.sqrt(X.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / n) || 0);
  const Z = X.map(r => [1, ...r.map((v, j) => (sd[j] ? (v - mean[j]) / sd[j] : 0))]);
  const d = k + 1;
  const b = new Array(d).fill(0);
  let Hinv: number[][] | null = null;

  for (let iter = 0; iter < 30; iter++) {
    const H = Array.from({ length: d }, () => new Array(d).fill(0));
    const g = new Array(d).fill(0);
    for (let i = 0; i < n; i++) {
      const eta = Z[i].reduce((s, v, j) => s + v * b[j], 0);
      const p = 1 / (1 + Math.exp(-eta));
      const w = p * (1 - p);
      for (let j = 0; j < d; j++) {
        g[j] += Z[i][j] * (y[i] - p);
        for (let l = j; l < d; l++) H[j][l] += w * Z[i][j] * Z[i][l];
      }
    }
    for (let j = 0; j < d; j++) for (let l = 0; l < j; l++) H[j][l] = H[l][j];
    // Ridge on slopes only (not the intercept) keeps rare outcomes and collinear types stable
    for (let j = 1; j < d; j++) { H[j][j] += lambda; g[j] -= lambda * b[j]; }
    Hinv = invert(H);
    if (!Hinv) return null;
    let step = 0;
    for (let j = 0; j < d; j++) {
      const delta = Hinv[j].reduce((s, v, l) => s + v * g[l], 0);
      b[j] += delta;
      step = Math.max(step, Math.abs(delta));
    }
    if (step < 1e-6) break;
  }
  if (!Hinv) return null;
  return {
    beta: Array.from({ length: k }, (_, j) => (sd[j] ? b[j + 1] / sd[j] : 0)),
    se: Array.from({ length: k }, (_, j) => (sd[j] ? Math.sqrt(Math.max(Hinv![j + 1][j + 1], 0)) / sd[j] : Infinity)),
  };
}

export function analyzeOutcome(samples: PartnerSample[], outcome: "progressed" | "referred"): OutcomeResult {
  const n = samples.length;
  const y: number[] = samples.map(s => (s[outcome] ? 1 : 0));
  const positives = y.reduce((a, v) => a + v, 0);
  const X = samples.map(s => s.counts.map(c => Math.min(c, CAP)));
  const enoughData = positives >= MIN_POSITIVES && n - positives >= MIN_POSITIVES;
  const fit = enoughData ? fitLogistic(X, y) : null;

  const drivers: DriverResult[] = DRIVER_FEATURES.map((f, j) => {
    const withIdx = samples.map((s, i) => (s.counts[j] > 0 ? i : -1)).filter(i => i >= 0);
    const nWith = withIdx.length;
    const posWith = withIdx.reduce((a, i) => a + y[i], 0);
    const rateWith = nWith ? posWith / nWith : 0;
    const rateWithout = n - nWith ? (positives - posWith) / (n - nWith) : 0;
    const beta = fit?.beta[j] ?? 0;
    const se = fit?.se[j] ?? Infinity;
    const z = Number.isFinite(se) && se > 0 ? beta / se : 0;
    const signal: Signal = !fit || nWith < MIN_WITH ? "insufficient" : Math.abs(z) >= 1.96 ? "strong" : Math.abs(z) >= 1.28 ? "some" : "none";
    return { index: j, plural: f.plural, singular: f.singular, oddsPerOne: Math.exp(beta), z, signal, rateWith, rateWithout, nWith };
  });

  const rank = (d: DriverResult) => (d.signal === "insufficient" ? -Infinity : d.z);
  drivers.sort((a, b) => rank(b) - rank(a));
  return { n, positives, baseRate: n ? positives / n : 0, drivers, enoughData };
}

// ─── Plain English ───────────────────────────────────────────────────────────

const pct = (r: number) => `${Math.round(r * 100)}%`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const times = (x: number) => (x >= 10 ? `${Math.round(x)}x` : `${x.toFixed(1)}x`);

export function explainOutcome(r: OutcomeResult, outcomePhrase: string): string[] {
  if (!r.n) return ["No referral partners in view yet."];
  if (!r.enoughData) {
    const few = r.positives === 0 ? `None of the ${r.n} partners` : `Only ${r.positives} of ${r.n} partners`;
    return [`${few} ${outcomePhrase} here, which is too few to tell what's driving it. Widen the date range or clear the rep filter.`];
  }

  const lines: string[] = [];
  const valid = r.drivers.filter(d => d.signal !== "insufficient");
  const ups = valid.filter(d => d.z > 0 && (d.signal === "strong" || d.signal === "some"));
  const downs = valid.filter(d => d.z < 0 && (d.signal === "strong" || d.signal === "some"));
  const flat = valid.filter(d => d.signal === "none");
  const thin = r.drivers.filter(d => d.signal === "insufficient");

  if (ups.length) {
    // Ranked by how clear the link is (z), which is not the same as the biggest effect per activity
    const top = ups[0];
    const lift = top.rateWithout >= 0.01 ? ` — ${times(top.rateWith / top.rateWithout)} the rate` : "";
    lines.push(
      `${cap(top.plural)} show the clearest link. Partners who got at least one ${top.singular} ${outcomePhrase} ${pct(top.rateWith)} of the time, vs ${pct(top.rateWithout)} for those who didn't${lift}.`
    );
    lines.push(
      `Holding the other activity types constant, each extra ${top.singular} goes with about ${times(top.oddsPerOne)} the odds${top.signal === "some" ? " (a moderate signal, not yet conclusive)" : ""}.`
    );
    for (const d of ups.slice(1)) {
      lines.push(`${cap(d.plural)} also help: ${pct(d.rateWith)} with vs ${pct(d.rateWithout)} without, and each extra ${d.singular} goes with about ${times(d.oddsPerOne)} the odds${d.signal === "some" ? " (moderate signal)" : ""}.`);
    }
  } else {
    lines.push(`No single activity type clearly stands out yet; results look similar regardless of the mix.`);
  }
  if (flat.length) {
    lines.push(`${cap(flat.map(d => d.plural).join(", ").replace(/, ([^,]*)$/, " and $1"))} show no clear link on their own once the other activity is accounted for.`);
  }
  for (const d of downs) {
    lines.push(`More ${d.plural} go with lower odds — often a sign of chasing partners who aren't engaging, rather than the ${d.plural} themselves hurting.`);
  }
  if (thin.length) {
    lines.push(`Too few partners had ${thin.map(d => d.plural).join(" or ")} to judge.`);
  }
  return lines;
}
