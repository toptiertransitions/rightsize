import "server-only";
import { getRehomingVendors } from "@/lib/airtable";
import { getZipCentroid, haversineDistanceMiles } from "@/lib/zip-centroids";
import { REHOMING_TYPES, sortKey, toRehomingResource, type RehomingResource } from "./rehoming";

export async function loadRehomingResources(): Promise<RehomingResource[]> {
  const vendors = await getRehomingVendors();
  return vendors
    .filter((v) => (REHOMING_TYPES as readonly string[]).includes(v.vendorType))
    .map((v) => toRehomingResource(v, !!getZipCentroid(v.zip.trim())))
    .filter((r) => r.name)
    .sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name)));
}

/** Crow-flies miles from originZip to each resource with a known zip, or
 * null when originZip isn't a recognized US zip. */
export function rehomingDistances(resources: RehomingResource[], originZip: string): Record<string, number> | null {
  const origin = getZipCentroid(originZip.trim());
  if (!origin) return null;
  const out: Record<string, number> = {};
  for (const r of resources) {
    const c = r.hasLocation ? getZipCentroid(r.zip) : null;
    if (c) out[r.id] = Math.round(haversineDistanceMiles(origin.lat, origin.lng, c.lat, c.lng) * 10) / 10;
  }
  return out;
}
