import type { PartnerCategory } from "@/lib/types";
import { getPartnerQuestions } from "./questions";

// The partner network is almost entirely Illinois today. Illinois zip codes
// are 600xx through 629xx.
export function isIllinoisZip(zip: string): boolean {
  const prefix = Number(zip.trim().slice(0, 3));
  return prefix >= 600 && prefix <= 629;
}

/**
 * True when any zip the client has given us (their current and destination
 * zips, plus every zip answer in their partner requests) is a full 5-digit
 * zip outside Illinois. Partial or blank entries don't count.
 */
export function hasNonIllinoisZip(
  tenantZips: (string | undefined)[],
  requestAnswers: Partial<Record<PartnerCategory, Record<string, string | string[]>>>
): boolean {
  const zips = [...tenantZips];
  for (const [category, answers] of Object.entries(requestAnswers)) {
    if (!answers) continue;
    for (const q of getPartnerQuestions(category as PartnerCategory)) {
      const v = answers[q.id];
      if (q.type === "zip" && typeof v === "string") zips.push(v);
    }
  }
  return zips.some((z) => !!z && /^\d{5}$/.test(z.trim()) && !isIllinoisZip(z));
}
