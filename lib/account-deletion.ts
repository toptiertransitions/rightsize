// Self-service account deletion for every non-staff account (Google Play
// and App Store require an in-app path for apps with sign-in). Server-only.
//
// Deletes only the person's own account: their access to projects
// (memberships), their partner-team seats, the link between their sign-in
// and a CRM referral contact, their device push tokens, their Users record,
// and finally the sign-in itself. Projects and partner companies are never
// archived or deleted here; they stay in place for everyone else on them.
import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { revalidateTag } from "next/cache";
import {
  deleteMembership,
  deleteUserRecord,
  findReferralContactByClerkUserId,
  getDeviceTokensForUsers,
  getMembershipsForUser,
  getSystemRole,
  getUserByClerkId,
  setReferralContactClerkUserId,
  unregisterDeviceToken,
} from "@/lib/airtable";
import { getPartnerUsersByClerkId, updatePartnerUser } from "@/lib/marketplace/partnerUsersData";

export type DeletionResult = { ok: true } | { ok: false; reason: "staff" | "error"; message: string };

/** Staff accounts are created and removed by Top Tier, not by the person. */
export async function canSelfDelete(clerkUserId: string): Promise<boolean> {
  const role = await getSystemRole(clerkUserId).catch(() => null);
  return !role;
}

export async function deleteOwnAccount(clerkUserId: string): Promise<DeletionResult> {
  if (!(await canSelfDelete(clerkUserId))) {
    return { ok: false, reason: "staff", message: "Staff accounts are managed by your Top Tier administrator." };
  }
  try {
    // Projects: remove only this person's access; the project itself stays
    const memberships = await getMembershipsForUser(clerkUserId).catch(() => []);
    await Promise.all(memberships.map((m) => deleteMembership(m.id)));
    if (memberships.length) revalidateTag("tenants");

    // Partner team seats (the partner company and its listing stay)
    const seats = await getPartnerUsersByClerkId(clerkUserId).catch(() => []);
    const now = new Date().toISOString();
    await Promise.all(seats.filter((r) => r.status === "Active" || r.status === "Invited").map((r) =>
      updatePartnerUser(r.id, { status: "Removed", removedAt: now, removedByName: "Account deleted", clerkUserId: null, inviteToken: null })
    ));

    // CRM referral portal login: keep the CRM contact (it's Top Tier's
    // business record), drop its link to this sign-in
    const contact = await findReferralContactByClerkUserId(clerkUserId).catch(() => null);
    if (contact) await setReferralContactClerkUserId(contact.id, null);

    // Devices
    const tokens = await getDeviceTokensForUsers([clerkUserId]).catch(() => []);
    await Promise.all(tokens.map((t) => unregisterDeviceToken(t.token).catch(() => {})));

    // Users record, then the sign-in
    const user = await getUserByClerkId(clerkUserId).catch(() => null);
    if (user) await deleteUserRecord(user.airtableId).catch((e) => console.error("[account-deletion] users record:", e));
    const clerk = await clerkClient();
    await clerk.users.deleteUser(clerkUserId);
    return { ok: true };
  } catch (e) {
    console.error("[account-deletion] failed:", e);
    return { ok: false, reason: "error", message: "We couldn't finish deleting your account. Please try again or email info@toptiertransitions.com." };
  }
}
