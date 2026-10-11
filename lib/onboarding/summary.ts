// Readable summary of a self-serve client's signup answers, for the
// "Internal Alert - New Non Client User Summary" email to TTT Admins.
// Server-only. Labels mirror the onboarding screens (app/get-started/steps).
import "server-only";
import type { Room, Tenant } from "@/lib/types";
import { HOW_HEARD_OPTIONS } from "@/lib/partners/referralShared";
import type { NonClientSummaryRow } from "@/lib/email";

const INTERESTS: Record<string, string> = {
  full_service: "Full Service Move Management",
  realtor: "Realtor",
  senior_community: "Senior Community",
  mover: "Mover",
  donation: "Donation Organization",
  hauling: "Junk Hauling",
  companion_care: "Companion Care",
  home_health_care: "Home Health Care",
  care_manager: "Care Management / Concierge",
  estate_attorney: "Estate Attorney",
  financial_advisory: "Financial Advisory",
  after_loss_support: "After Loss Support",
};
const TIMELINE_RANGES: Record<string, string> = {
  asap: "ASAP", "1_3": "1 to 3 months", "3_6": "3 to 6 months", "6_12": "6 to 12 months", not_sure: "Not sure yet",
};
const DESTINATIONS: Record<string, string> = {
  house: "House", condo: "Condo / Apartment", senior_community: "Senior Community", other: "Other", not_sure: "Not sure yet",
};
const SQFT: Record<string, string> = {
  under_1000: "Under 1,000", "1000_2000": "1,000 to 2,000", "2000_3000": "2,000 to 3,000",
  "3000_4500": "3,000 to 4,500", "4500_plus": "4,500+", not_sure: "Not sure",
};
const DENSITY: Record<string, string> = {
  light: "Pretty light", comfortable: "Comfortably full", full: "Full of a lifetime", collector: "I'm a collector",
};

function timeline(t: Tenant): string {
  const v = t.timelineValue ?? "";
  if (!v) return "";
  if (t.timelineType === "range") return TIMELINE_RANGES[v] ?? v;
  const d = new Date(t.timelineType === "month" ? `${v}-01T12:00:00` : `${v}T12:00:00`);
  if (isNaN(d.getTime())) return v;
  return t.timelineType === "month"
    ? `Around ${d.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`
    : `By ${d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
}

export function buildSignupSummarySections(
  t: Tenant,
  extras: { rooms: Room[]; destinationCommunityName?: string; brandName?: string }
): Array<{ title: string; rows: NonClientSummaryRow[] }> {
  const rows = (pairs: Array<[string, string | undefined | null | false]>): NonClientSummaryRow[] =>
    pairs.filter(([, v]) => v !== undefined && v !== null && v !== false && v !== "").map(([label, v]) => ({ label, value: String(v) }));

  const howHeard = HOW_HEARD_OPTIONS.find((o) => o.key === t.howHeard)?.label ?? t.howHeard;
  const roomNames = extras.rooms.map((r) => r.name).filter(Boolean);

  return [
    {
      title: "What they're looking for",
      rows: rows([
        ["Services interested in", (t.serviceInterests ?? []).map((k) => INTERESTS[k] ?? k).join(", ") || (t.appOnlyIntent ? "Just using the app" : "")],
        ["Using the app on their own", t.appOnlyIntent ? "Yes" : undefined],
        ["Timeline", timeline(t)],
      ]),
    },
    {
      title: "Where they're moving",
      rows: rows([
        ["Current zip", t.currentZip],
        ["Moving to", t.destinationType ? DESTINATIONS[t.destinationType] ?? t.destinationType : undefined],
        ["Destination zip", t.destinationZip],
        ["Community", extras.destinationCommunityName || t.destinationCommunityOther],
      ]),
    },
    {
      title: "Their home today",
      rows: rows([
        ["Square footage", t.sqftExact ? `${t.sqftExact.toLocaleString("en-US")} sq ft` : t.sqftRange ? SQFT[t.sqftRange] ?? t.sqftRange : undefined],
        ["How full it is", t.homeDensity ? DENSITY[t.homeDensity] ?? t.homeDensity : undefined],
        ["Bedrooms", t.bedrooms != null ? String(t.bedrooms) : undefined],
        ["Bathrooms", t.bathrooms != null ? String(t.bathrooms) : undefined],
        ["Rooms set up", roomNames.length ? roomNames.join(", ") : undefined],
      ]),
    },
    {
      title: "How they found us",
      rows: rows([
        ["Heard about us", howHeard],
        ["Referred by", t.howHeardDetail],
        ["Community branding", extras.brandName],
      ]),
    },
  ];
}
