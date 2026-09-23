// Stub event logger for the self-serve onboarding wizard. Swap the body for
// a real analytics call (PostHog, GA, etc.) when one is wired up — call
// sites and event names won't need to change.
export type OnboardingEvent =
  | "step_viewed"
  | "step_completed"
  | "onboarding_completed";

export function logOnboardingEvent(event: OnboardingEvent, data: Record<string, unknown> = {}) {
  console.log(`[onboarding] ${event}`, data);
}
