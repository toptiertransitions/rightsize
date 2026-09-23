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
  /** Set only on the system-injected "Top Tier Transitions" Move Manager
   * entry built from the project's assigned Team Lead — never a real
   * LocalVendors record. Drives PartnerCard's non-interactive, no-rating
   * display and the phone link. */
  isTeamLead?: boolean;
  teamLeadName?: string;
  phone?: string;
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
