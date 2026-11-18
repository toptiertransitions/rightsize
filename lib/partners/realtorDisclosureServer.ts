// Server side of the realtor referral disclosure (wording and rules live in
// ./realtorDisclosure.ts): the feature flag, the acknowledgment record and
// the TTT Admin email.
//
// Records are write-once: this module only ever creates them, nothing in the
// app updates or deletes them, and no job clears them. Keep at least 5 years.
import { createHash, randomUUID } from "crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { AIRTABLE_TABLES, isTTTAdmin } from "@/lib/config";
import { getMembershipsForTenant } from "@/lib/airtable";
import { sendRealtorDisclosureAckAdminNotification } from "@/lib/admin-notifications";
import { REALTOR_DISCLOSURE, disclosureSnapshot, realtorAckError, type RealtorAckInput } from "./realtorDisclosure";

// ─── Feature flag ────────────────────────────────────────────────────────────
// REALTOR_DISCLOSURE_FLAG:
//   unset / anything else  off for everyone (the default; nothing changes)
//   "test"                 on only for TTT Admins and the Clerk user ids in
//                          REALTOR_DISCLOSURE_TEST_USER_IDS (comma-separated),
//                          so it can be tried on real screens before launch
//   "on"                   on for everyone
export function isRealtorDisclosureEnabled(userId: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  const mode = (env.REALTOR_DISCLOSURE_FLAG ?? "").trim().toLowerCase();
  if (mode === "on") return true;
  if (mode !== "test" || !userId) return false;
  const testers = (env.REALTOR_DISCLOSURE_TEST_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return testers.includes(userId) || isTTTAdmin(userId);
}

// ─── Record ──────────────────────────────────────────────────────────────────

export interface RealtorAckRecord {
  ackId: string;
  acknowledgedAt: string;
  tenantId: string;
  projectName: string;
  clientUserId: string;
  clientName: string;
  actingUserId: string;
  actingUserName: string;
  actingRole: string;
  staffConfirmedClientAgreed: boolean;
  understandsCompensation: boolean;
  consentsToShareInfo: boolean;
  disclosureVersion: string;
  disclosureTextSnapshot: string;
  disclosureTextSha256: string;
  realtors: { id: string; name: string }[];
  context: "intro_request" | "select";
}

/** Creates the record. Throws if it can't be saved, so the caller stops the
 * introduction: no realtor match goes through without its acknowledgment. */
export async function createRealtorAckRecord(r: RealtorAckRecord, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLES.REALTOR_DISCLOSURE_ACKS)}`,
    {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        typecast: false,
        fields: {
          AckId: r.ackId,
          AcknowledgedAt: r.acknowledgedAt,
          TenantId: r.tenantId,
          ProjectName: r.projectName,
          ClientUserId: r.clientUserId,
          ClientName: r.clientName,
          ActingUserId: r.actingUserId,
          ActingUserName: r.actingUserName,
          ActingRole: r.actingRole,
          StaffConfirmedClientAgreed: r.staffConfirmedClientAgreed,
          UnderstandsCompensation: r.understandsCompensation,
          ConsentsToShareInfo: r.consentsToShareInfo,
          Checkbox1Label: REALTOR_DISCLOSURE.checkboxCompensation,
          Checkbox2Label: REALTOR_DISCLOSURE.checkboxShareInfo,
          DisclosureVersion: r.disclosureVersion,
          DisclosureTextSnapshot: r.disclosureTextSnapshot,
          DisclosureTextSha256: r.disclosureTextSha256,
          RealtorIds: r.realtors.map((x) => x.id).join(", "),
          RealtorNames: r.realtors.map((x) => x.name).join(", "),
          Context: r.context,
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`Realtor disclosure record failed: ${res.status} ${await res.text().catch(() => "")}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function clerkName(userId: string): Promise<string> {
  try {
    const u = await (await clerkClient()).users.getUser(userId);
    return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.emailAddresses[0]?.emailAddress || "";
  } catch {
    return "";
  }
}

/**
 * Validates and records one acknowledgment, then emails the TTT Admins
 * without waiting (an email failure is logged and never blocks the client).
 * Returns an error message to show, or null once the record is saved.
 */
export async function acknowledgeRealtorDisclosure(params: {
  ack: RealtorAckInput | null | undefined;
  actingUserId: string;
  /** The actor's TTT system role, when they're staff acting for the client */
  staffRole: string | null;
  tenant: { id: string; name: string };
  realtors: { id: string; name: string }[];
  context: RealtorAckRecord["context"];
  sendEmail?: boolean;
}, deps: {
  createRecord?: typeof createRealtorAckRecord;
  notify?: typeof sendRealtorDisclosureAckAdminNotification;
} = {}): Promise<string | null> {
  const actingAsStaff = !!params.staffRole;
  const err = realtorAckError(params.ack, actingAsStaff);
  if (err) return err;
  const ack = params.ack!;

  // The client is the project's Owner; a client acting for themselves is it
  let clientUserId = params.actingUserId;
  if (actingAsStaff) {
    const owner = (await getMembershipsForTenant(params.tenant.id).catch(() => [])).find((m) => m.role === "Owner");
    clientUserId = owner?.userId ?? "";
  }
  const [actingUserName, ownerName] = await Promise.all([
    clerkName(params.actingUserId),
    actingAsStaff && clientUserId ? clerkName(clientUserId) : Promise.resolve(""),
  ]);
  const clientName = (actingAsStaff ? ownerName : actingUserName) || params.tenant.name;
  const snapshot = disclosureSnapshot();

  const record: RealtorAckRecord = {
    ackId: randomUUID(),
    acknowledgedAt: new Date().toISOString(),
    tenantId: params.tenant.id,
    projectName: params.tenant.name,
    clientUserId,
    clientName,
    actingUserId: params.actingUserId,
    actingUserName,
    actingRole: params.staffRole ?? "Client",
    staffConfirmedClientAgreed: actingAsStaff && ack.staffConfirmedClientAgreed === true,
    understandsCompensation: ack.understandsCompensation,
    consentsToShareInfo: ack.consentsToShareInfo,
    disclosureVersion: REALTOR_DISCLOSURE.version,
    disclosureTextSnapshot: snapshot,
    disclosureTextSha256: createHash("sha256").update(snapshot).digest("hex"),
    realtors: params.realtors,
    context: params.context,
  };

  try {
    await (deps.createRecord ?? createRealtorAckRecord)(record);
  } catch (e) {
    console.error("[realtor-disclosure] record failed:", e);
    return "We couldn't save your acknowledgment. Please try again.";
  }

  if (params.sendEmail !== false) {
    (deps.notify ?? sendRealtorDisclosureAckAdminNotification)(record).catch((e) =>
      console.error("[realtor-disclosure] admin email failed:", e)
    );
  }
  return null;
}
