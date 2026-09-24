// Stub event logger for the guided partner-matching funnel (Phase 2/3) —
// same convention as lib/onboarding/analytics.ts. Swap the body for a real
// analytics call when one is wired up; call sites and event names won't
// need to change.
export type PartnerMatchEvent =
  | "request_started"
  | "request_completed"
  | "match_shown"
  | "intro_requested";

export function logPartnerMatchEvent(event: PartnerMatchEvent, data: Record<string, unknown> = {}) {
  console.log(`[partner-match] ${event}`, data);
}
