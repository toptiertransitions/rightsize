// Regenerates lib/data/il-county-zips.json from the U.S. Census Bureau's
// 2020 ZCTA-to-county relationship file (public domain).
// Run: node scripts/build-il-county-zips.mjs
//
// A ZIP is listed under every Illinois county that holds at least 10% of its
// land area, plus its primary (largest-share) county — so border ZIPs count
// for each county they meaningfully cover, and every ZIP maps somewhere.
import { writeFileSync } from "node:fs";

const SOURCE = "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt";
const STATE_FIPS = "17"; // Illinois
const MIN_SHARE = 0.1;

const text = (await (await fetch(SOURCE)).text()).replace(/^﻿/, "");
const [headerLine, ...lines] = text.split(/\r?\n/);
const header = headerLine.split("|");
const col = (name) => header.indexOf(name);
const [iZip, iCounty, iName, iZipLand, iPartLand] = [
  "GEOID_ZCTA5_20", "GEOID_COUNTY_20", "NAMELSAD_COUNTY_20", "AREALAND_ZCTA5_20", "AREALAND_PART",
].map(col);

const byZip = new Map();
for (const line of lines) {
  const f = line.split("|");
  if (!f[iZip] || !f[iCounty]?.startsWith(STATE_FIPS)) continue;
  const zipLand = Number(f[iZipLand]) || 0;
  const share = zipLand ? (Number(f[iPartLand]) || 0) / zipLand : 0;
  const county = f[iName].replace(/ County$/, "");
  if (!byZip.has(f[iZip])) byZip.set(f[iZip], []);
  byZip.get(f[iZip]).push({ county, share });
}

const counties = {};
for (const [zip, parts] of byZip) {
  const primary = parts.reduce((a, b) => (b.share > a.share ? b : a)).county;
  const keep = new Set([primary, ...parts.filter((p) => p.share >= MIN_SHARE).map((p) => p.county)]);
  for (const c of keep) (counties[c] ??= []).push(zip);
}
const sorted = Object.fromEntries(Object.keys(counties).sort().map((c) => [c, counties[c].sort()]));
writeFileSync(new URL("../lib/data/il-county-zips.json", import.meta.url), JSON.stringify(sorted) + "\n");
console.log(`${Object.keys(sorted).length} counties, ${byZip.size} ZIPs`);
