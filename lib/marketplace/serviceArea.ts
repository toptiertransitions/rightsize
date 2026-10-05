// Single source of truth for parsing and matching a Partner's service area —
// replaces the old comma-separated-string-plus-hand-rolled-parser pattern
// (LocalVendor.zipCodesServed + lib/airtable.ts's ad hoc splits). Every
// consumer should call matchesLocation() rather than reading
// MarketplaceServiceArea fields directly.
import type { MarketplaceDeliveryMode, MarketplaceServiceArea } from "./types";

export interface MarketplaceClientLocation {
  zip?: string;
  state?: string;
}

export function emptyServiceArea(): MarketplaceServiceArea {
  return { zips: [], counties: [], statewide: false, nationwide: false };
}

/** The county quick-select in the admin UI expands to its member zips at
 * SAVE time (see /admin/marketplace's service-area editor, Phase 3) — the
 * `counties` list on a saved MarketplaceServiceArea is informational (what
 * the admin picked), matching always happens against `zips`.
 *
 * Per spec: "Virtual partners can serve statewide or nationwide" — so
 * `statewide`/`nationwide` only ever match when the partner can actually
 * serve virtually (deliveryMode is Virtual or Both). A purely in-person
 * partner's reach is defined entirely by `zips`. */
export function matchesLocation(
  serviceArea: MarketplaceServiceArea,
  location: MarketplaceClientLocation,
  partnerState: string,
  deliveryMode: MarketplaceDeliveryMode
): boolean {
  const canServeVirtually = deliveryMode !== "In-person";

  if (serviceArea.nationwide && canServeVirtually) return true;
  if (serviceArea.statewide && canServeVirtually && location.state && partnerState && location.state === partnerState) return true;
  if (location.zip && serviceArea.zips.includes(location.zip)) return true;
  return false;
}

export function addZipsFromCounty(existingZips: string[], countyZips: string[]): string[] {
  return Array.from(new Set([...existingZips, ...countyZips]));
}
