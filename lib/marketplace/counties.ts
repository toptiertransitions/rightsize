// Illinois county → ZIP lookup for the partner Service Area editor. Picking
// a county expands to its ZIPs when the service area is saved, so matching
// (which only ever reads serviceArea.zips — see serviceArea.ts) needs no
// changes. Data: lib/data/il-county-zips.json, generated from the 2020
// Census ZCTA-to-county file by scripts/build-il-county-zips.mjs.
// Client-safe.
import IL_COUNTY_ZIPS from "@/lib/data/il-county-zips.json";

const ZIPS_BY_COUNTY = IL_COUNTY_ZIPS as Record<string, string[]>;

/** Stored on MarketplaceServiceArea.counties as "<County>, IL". */
export function countyKey(name: string): string {
  return `${name}, IL`;
}

export interface CountyOption {
  key: string;
  name: string;
  zipCount: number;
}

export const IL_COUNTY_OPTIONS: CountyOption[] = Object.keys(ZIPS_BY_COUNTY).map((name) => ({
  key: countyKey(name),
  name,
  zipCount: ZIPS_BY_COUNTY[name].length,
}));

const KNOWN_KEYS = new Set(IL_COUNTY_OPTIONS.map((c) => c.key));

export function isKnownCounty(key: string): boolean {
  return KNOWN_KEYS.has(key);
}

/** All ZIPs covered by the given county keys (unknown keys are ignored). */
export function zipsForCounties(keys: string[]): string[] {
  const zips = new Set<string>();
  for (const key of keys) {
    const name = key.replace(/, IL$/, "");
    for (const z of ZIPS_BY_COUNTY[name] ?? []) zips.add(z);
  }
  return [...zips].sort();
}
