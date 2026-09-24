import type { PartnerCategory } from "@/lib/types";

// Category-tailored word for the "Completed N ___ to Community" card stat.
// Categories without an entry (Move Manager, Community) fall back to
// "Project(s)" — they're not expected to ever carry real completion data,
// since Move Manager is the synthetic TTT card and Community is the
// destination itself, not a partner.
const COMPLETION_WORD: Partial<Record<PartnerCategory, [singular: string, plural: string]>> = {
  Mover: ["Move", "Moves"],
  Realtor: ["Home Sale", "Home Sales"],
  Hauler: ["Haul-Away", "Haul-Aways"],
  Donation: ["Donation", "Donations"],
};

export function communityCompletionLabel(category: PartnerCategory, count: number, communityName: string): string {
  const [singular, plural] = COMPLETION_WORD[category] ?? ["Project", "Projects"];
  return `Completed ${count} ${count === 1 ? singular : plural} to ${communityName}`;
}
