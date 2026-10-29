// Client-safe pieces of review collateral (lib/review-collateral).
import type { Tenant } from "@/lib/types";

/** Only 5-star reviews become marketing collateral. */
export const COLLATERAL_MIN_STARS = 5;

/** Choices offered in the review form (free text is allowed too). */
export const CLIENT_TYPE_OPTIONS = [
  "Relocation Client",
  "Downsizing Client",
  "Unpacking Client",
  "Estate Sale Client",
  "Family Member",
  "Senior Living Partner",
  "Realtor Partner",
] as const;

export interface ReviewCollateralDetails {
  /** "Jim K." */
  displayName: string;
  /** "Relocation Client" */
  clientType: string;
  /** "Oak Park, Illinois" */
  town: string;
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** "Jim Kowalski" -> "Jim K."; a single name stays as is. */
export function firstNameLastInitial(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** "Oak Park" + "IL" -> "Oak Park, Illinois" (the originals spell the state out). */
export function townLabel(city?: string, state?: string): string {
  const c = city?.trim() ?? "";
  const st = state?.trim() ?? "";
  const stateName = STATE_NAMES[st.toUpperCase()] ?? st;
  return [c, stateName].filter(Boolean).join(", ");
}

/** Best guess from what the project's estimate covers. Editable in the form. */
export function clientTypeFor(tenant: Pick<Tenant, "isEstateSale" | "estimatedServiceHours">): string {
  if (tenant.isEstateSale) return "Estate Sale Client";
  const services = (tenant.estimatedServiceHours ?? []).filter((s) => s.hours > 0).map((s) => s.serviceName.toLowerCase());
  const has = (word: string) => services.some((s) => s.includes(word));
  if (has("estate sale")) return "Estate Sale Client";
  if (has("moving day") || has("packing to move")) return "Relocation Client";
  if (has("rightsizing") || has("donat")) return "Downsizing Client";
  if (has("unpack") || has("setting up")) return "Unpacking Client";
  return "Relocation Client";
}

/** Cleans up what the form sent; null when there's no name to print. */
export function parseCollateralDetails(raw: unknown): ReviewCollateralDetails | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const displayName = clean(r.displayName, 40);
  if (!displayName) return null;
  return { displayName, clientType: clean(r.clientType, 40), town: clean(r.town, 60) };
}

