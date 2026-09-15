/**
 * Project status categorization — mirrors the exact precedence already
 * used in app/(protected)/home/AdminProjectsClient.tsx, so "Active" /
 * "Post Move Consignment" / "Not Yet Signed" / "Archived" mean the same
 * thing everywhere in the app. Lost Deals are handled separately (never
 * appear in pickers, per existing convention) and aren't one of these.
 */
import type { Tenant } from "./types";

export type ProjectStatus = "active" | "consignment" | "not-signed" | "archived";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  consignment: "Post Move Consignment",
  "not-signed": "Not Yet Signed",
  archived: "Archived",
};

export function getProjectStatus(t: Pick<Tenant, "isArchived" | "isConsignmentOnly" | "isContractSigned">): ProjectStatus {
  if (t.isArchived) return "archived";
  if (t.isConsignmentOnly) return "consignment";
  if (t.isContractSigned === false) return "not-signed";
  return "active";
}
