// Realtor referral disclosure: the single source of truth for its wording,
// checkbox labels and version. Everything that shows, records or emails the
// disclosure reads from here, so attorney/NIREIN edits are made in this one
// file. Bump DISCLOSURE_VERSION whenever any wording below changes; every
// acknowledgment stores the version and an exact snapshot of what was shown.
//
// Client-safe (no server imports). The feature flag lives in
// realtorDisclosureServer.ts.
import type { PartnerCategory } from "@/lib/types";

export const REALTOR_DISCLOSURE = {
  version: "v1-draft",
  heading: "How we're compensated for realtor introductions",
  body: [
    "Top Tier Transitions does not charge a separate fee for realtor introductions. Matt Kamhi, CEO of Top Tier Transitions, is an Illinois licensed real estate broker (License No. 475.220834) sponsored by Northern Illinois Real Estate Information Network, Inc. (NIREIN), License No. 478.008549. His license is referral-only. If you choose to work with a realtor we introduce, Matt may receive a referral fee through NIREIN, paid by the realtor's brokerage when a sale closes.",
    "Referral fees do not influence which realtors we recommend. We recommend realtors based on their experience, responsiveness, and fit for your situation. You are never required to use a realtor we introduce, and you are free to choose any realtor you like.",
    "Top Tier Transitions and Matt do not represent you in buying or selling real estate. Your realtor will be your agent. You can verify Matt's license at idfpr.illinois.gov.",
  ],
  /** In-flow reminder; followed by a "Learn more" toggle that expands the full text */
  short:
    "Reminder: Matt Kamhi, CEO of Top Tier Transitions and an Illinois licensed real estate broker (License No. 475.220834, sponsored by NIREIN), may receive a referral fee if you work with a realtor we introduce. This does not influence our recommendations.",
  learnMore: "Learn more",
  checkboxCompensation:
    "I have read and understand how Top Tier Transitions may be compensated for introducing me to a realtor.",
  checkboxShareInfo:
    "I agree to Top Tier Transitions sharing my contact information and details about my situation with the realtor(s) I select so they can contact me.",
  /** Shown only when a staff member submits on the client's behalf */
  staffConfirm:
    "I confirm the client has reviewed this disclosure and agreed to both statements above.",
  verifyUrl: "https://idfpr.illinois.gov",
} as const;

export const REALTOR_CATEGORY: PartnerCategory = "Realtor";

/** The text exactly as shown, for the acknowledgment record */
export function disclosureSnapshot(d: typeof REALTOR_DISCLOSURE = REALTOR_DISCLOSURE): string {
  return [d.heading, ...d.body].join("\n\n");
}

/** What the browser sends with a realtor intro/selection when the flag is on */
export interface RealtorAckInput {
  version: string;
  understandsCompensation: boolean;
  consentsToShareInfo: boolean;
  /** Required when a staff member is acting on the client's behalf */
  staffConfirmedClientAgreed?: boolean;
}

/** Only the Realtor category is ever gated, and only with the flag on. */
export function realtorAckRequired(category: PartnerCategory, enabled: boolean): boolean {
  return enabled && category === REALTOR_CATEGORY;
}

/** Submit stays disabled until this is true (also re-checked on the server). */
export function canSubmitRealtorAck(ack: Partial<RealtorAckInput> | null | undefined, actingAsStaff: boolean): boolean {
  if (!ack?.understandsCompensation || !ack.consentsToShareInfo) return false;
  return actingAsStaff ? ack.staffConfirmedClientAgreed === true : true;
}

/** Server-side check: why an acknowledgment isn't acceptable, or null if it is. */
export function realtorAckError(ack: RealtorAckInput | null | undefined, actingAsStaff: boolean): string | null {
  if (!ack) return "Please review the realtor referral disclosure and check both boxes to continue.";
  if (ack.version !== REALTOR_DISCLOSURE.version) return "The disclosure was updated. Please refresh the page and review it again.";
  if (!canSubmitRealtorAck(ack, actingAsStaff)) {
    return actingAsStaff
      ? "Please confirm the client has reviewed the disclosure and agreed to both statements."
      : "Please check both boxes to continue.";
  }
  return null;
}
