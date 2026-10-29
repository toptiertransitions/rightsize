// CRM Tasks — every open Next Step across referral partners, clients and opportunities.
// Pure (no server imports) so the Tasks tab and the weekly Friday email share one definition.
import type { ClientContact, ClientOpportunity, ReferralCompany, ReferralContact } from "./types";

export type CrmTaskKind = "referral" | "client" | "opportunity";

/** Filter groups on the Tasks tab — clients and opportunities share one group. */
export type CrmTaskGroup = "referral" | "client";

export interface CrmTask {
  /** Unique across kinds: `${kind}:${recordId}` */
  key: string;
  kind: CrmTaskKind;
  /** ReferralContact / ClientContact / ClientOpportunity record id */
  recordId: string;
  /** Client contact id behind a client or opportunity task (for logging activity) */
  clientContactId?: string;
  contactName: string;
  /** Company for referral tasks; "Client" or "Opportunity · <stage>" otherwise */
  companyName: string;
  /** YYYY-MM-DD, or "" when the Next Step has no date */
  date: string;
  note: string;
  ownerClerkId: string;
}

export function taskGroup(kind: CrmTaskKind): CrmTaskGroup {
  return kind === "referral" ? "referral" : "client";
}

export function buildCrmTasks({
  referralContacts,
  companies,
  clientContacts,
  opportunities,
}: {
  referralContacts: ReferralContact[];
  companies: ReferralCompany[];
  clientContacts: ClientContact[];
  opportunities: ClientOpportunity[];
}): CrmTask[] {
  const companyMap = new Map(companies.map(c => [c.id, c]));
  const clientMap = new Map(clientContacts.map(c => [c.id, c]));
  const tasks: CrmTask[] = [];

  for (const rc of referralContacts) {
    if (!rc.nextStepDate && !rc.nextStepNote) continue;
    const company = companyMap.get(rc.referralCompanyId);
    tasks.push({
      key: `referral:${rc.id}`,
      kind: "referral",
      recordId: rc.id,
      contactName: rc.name,
      companyName: company?.name ?? "—",
      date: (rc.nextStepDate ?? "").slice(0, 10),
      note: rc.nextStepNote ?? "",
      ownerClerkId: company?.assignedToClerkId ?? "",
    });
  }

  for (const cc of clientContacts) {
    if (!cc.nextStepDate && !cc.nextStepNote) continue;
    tasks.push({
      key: `client:${cc.id}`,
      kind: "client",
      recordId: cc.id,
      clientContactId: cc.id,
      contactName: cc.name,
      companyName: "Client",
      date: (cc.nextStepDate ?? "").slice(0, 10),
      note: cc.nextStepNote ?? "",
      ownerClerkId: cc.assignedToClerkId,
    });
  }

  for (const opp of opportunities) {
    // Lost opportunities are closed out — their old Next Steps aren't real tasks anymore
    if (opp.stage === "Lost") continue;
    if (!opp.nextStepDate && !opp.nextStepNote) continue;
    const client = clientMap.get(opp.clientContactId);
    tasks.push({
      key: `opportunity:${opp.id}`,
      kind: "opportunity",
      recordId: opp.id,
      clientContactId: opp.clientContactId || undefined,
      contactName: client?.name ?? "Unknown client",
      companyName: `Opportunity · ${opp.stage}`,
      date: (opp.nextStepDate ?? "").slice(0, 10),
      note: opp.nextStepNote ?? "",
      ownerClerkId: opp.assignedToClerkId || client?.assignedToClerkId || "",
    });
  }

  return tasks;
}
