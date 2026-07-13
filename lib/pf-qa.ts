import type { Item } from "./types";

const GENERIC_TITLE_RE = /^(various|misc|miscellaneous|unknown|untitled|lot|assorted|items?|stuff|things|other|n\/a|tbd|mixed)\b/i;

export type QAIssueSeverity = "critical" | "warning";
export type QAFixField = "itemName" | "listingDescriptionEbay" | "conditionNotes";

export interface QAIssue {
  field: string;
  severity: QAIssueSeverity;
  label: string;
}

export const AI_FIXABLE_FIELDS: Array<{ key: QAFixField; label: string }> = [
  { key: "itemName",               label: "Item Name" },
  { key: "listingDescriptionEbay", label: "Listing Description" },
  { key: "conditionNotes",         label: "Condition Notes" },
];

export function getQAIssues(item: Item): QAIssue[] {
  const issues: QAIssue[] = [];

  const title = (item.itemName ?? "").trim();
  if (title.length < 5 || GENERIC_TITLE_RE.test(title)) {
    issues.push({ field: "itemName", severity: "critical", label: "Generic or vague title" });
  }

  if (!item.photos || item.photos.length === 0) {
    issues.push({ field: "photos", severity: "critical", label: "No photos uploaded" });
  } else if (item.photos.length === 1) {
    issues.push({ field: "photos", severity: "warning", label: "Only 1 photo" });
  }

  const desc = (item.listingDescriptionEbay ?? "").trim();
  if (desc.length < 20) {
    issues.push({ field: "listingDescriptionEbay", severity: "critical", label: desc.length === 0 ? "No listing description" : "Description too short" });
  }

  const condNotes = (item.conditionNotes ?? "").trim();
  if (condNotes.length < 10) {
    issues.push({ field: "conditionNotes", severity: "warning", label: condNotes.length === 0 ? "No condition notes" : "Condition notes too short" });
  }

  if (!item.pickupLocation) {
    issues.push({ field: "pickupLocation", severity: "warning", label: "No pickup location set" });
  }

  if (!item.valueMid || item.valueMid === 0) {
    issues.push({ field: "valueMid", severity: "critical", label: "No price set" });
  }

  return issues;
}

export function isAIFixable(issue: QAIssue): boolean {
  return (AI_FIXABLE_FIELDS as { key: string; label: string }[]).some(f => f.key === issue.field);
}
