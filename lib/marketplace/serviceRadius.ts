// Server-only zip + radius helpers shared by partner setup, My Listing and
// admin. Matching only ever reads serviceArea.zips, so counties and a
// zip + radius are both expanded into that list when saved.
import "server-only";
import zipcodes from "zipcodes";
import { isKnownCounty, zipsForCounties } from "./counties";
import type { MarketplacePartner } from "./types";

export const RADIUS_MIN_MILES = 5;
export const RADIUS_MAX_MILES = 100;
export const RADIUS_DEFAULT_MILES = 25;

/** Every zip within `miles` of `zip` (including it), or [] if unknown. */
export function zipsInRadius(zip: string, miles: number): string[] {
  if (!/^\d{5}$/.test(zip) || !zipcodes.lookup(zip)) return [];
  return ((zipcodes.radius(zip, miles) ?? []) as string[]).filter((z) => /^\d{5}$/.test(z));
}

export function placeForZip(zip: string): string | null {
  const z = /^\d{5}$/.test(zip) ? zipcodes.lookup(zip) : undefined;
  return z ? `${z.city}, ${z.state}` : null;
}

/** The form state for the partner "Where do you work?" screen. */
export function areaFormFor(partner: MarketplacePartner) {
  const sa = partner.serviceArea;
  const counties = sa.counties.filter(isKnownCounty);
  const covered = new Set([...zipsForCounties(counties), ...(sa.radius ? zipsInRadius(sa.radius.zip, sa.radius.miles) : [])]);
  return {
    deliveryMode: partner.deliveryMode,
    areaMode: (sa.radius ? "radius" : "counties") as "radius" | "counties",
    counties,
    extraZipsText: sa.zips.filter((z) => !covered.has(z)).join(", "),
    statewide: sa.statewide,
    radiusZip: sa.radius?.zip ?? partner.zip ?? "",
    radiusMiles: sa.radius?.miles ?? RADIUS_DEFAULT_MILES,
  };
}
