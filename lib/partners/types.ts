import type { PartnerCategory } from "@/lib/types";

export type { PartnerCategory };
export { PARTNER_CATEGORIES } from "@/lib/types";

// A fully-computed partner profile, ready for matching/display — merges the
// raw LocalVendor directory record with derived rating and project-count data.
export interface PartnerProfile {
  id: string;
  vendorName: string;
  category: PartnerCategory;
  logo?: string;
  website?: string;
  zipCodesServed: string; // comma-separated
  city: string;
  state: string;
  featuredRank?: number;
  /** Bayesian-adjusted average, 1 decimal — what's shown to users. */
  avgRating: number;
  /** Raw unweighted average, for reference/debugging. */
  rawAvgRating: number;
  reviewCount: number;
  /** Dynamic count (via linked Vendor engagements on completed projects) + manual adjustment. */
  projectsCompleted: number;
  /** Paragraph shown in the "Learn More" detail popup, editable in /admin/local-vendors. */
  aboutUs?: string;
  /**
   * "Month YYYY" labels, one per completed (archived) project this partner
   * worked on, newest first — only for projects archived since ArchivedAt
   * started being stamped (older archives predate the field and won't
   * appear). Omitted entirely when there are none.
   */
  recentProjectMonths?: string[];
  /** Set only on the system-injected "Top Tier Transitions" Move Manager
   * entry built from the project's assigned Team Lead — never a real
   * LocalVendors record. Drives PartnerCard's non-interactive, no-rating
   * display and the phone link. */
  isTeamLead?: boolean;
  teamLeadName?: string;
  phone?: string;
  /** Admin-set in /admin/local-vendors — feeds the scoring engine's "senior
   * specialty" factor (see lib/partners/scoring.ts). */
  seniorSpecialty?: boolean;
  /** Admin-set 1-5 in /admin/local-vendors — feeds the "responsiveness"
   * factor; unset is treated as neutral (3) rather than penalized. */
  responsivenessScore?: number;
  /** Vendor contact email — only populated for real LocalVendors records
   * (never the synthetic Team Lead entry), used to send the Phase 3 intro
   * request notification. Not shown anywhere in the client-facing UI. */
  email?: string;
  /**
   * Only set (and only when > 0) when the viewing project has a resolved
   * destination community — this partner's count of completed (archived,
   * non-lost) projects tagged with that same community via the
   * /admin/local-vendors "Project History" tool. Attached per-request in
   * app/(protected)/partners/page.tsx onto a cloned partner object, never
   * onto the cached getPartnerDirectory() result — see
   * lib/partners/communityCompletions.ts.
   */
  communityCompletionCount?: number;
  /** The resolved community name this count is relative to; paired with
   * communityCompletionCount, always set together. */
  communityName?: string;
}

export interface MatchResult {
  partner: PartnerProfile;
  rank: number; // 1-based within this category's results
  matchedLocation: "area" | "nearby";
}

export interface ClientLocation {
  zip?: string;
  state?: string;
}
