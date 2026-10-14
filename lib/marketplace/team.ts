// Partner company accounts: who can sign in to a marketplace partner's
// portal, and every rule about changing that. Server-only.
//
// Model
//  - PartnerUsers rows (./partnerUsersData.ts) are the source of truth for
//    portal access to a marketplace company. They don't depend on the CRM:
//    a teammate never needs a CRMReferralContacts record.
//  - Each company has at most one Active Primary (the account owner) and any
//    number of Active Members. A person belongs to one company at a time.
//  - Before this table existed, a company's single login came through its
//    CRM contact. Those people are adopted on their next visit (see
//    adoptLegacyLogin), so nobody loses access; a Removed row always wins
//    over that legacy path, so removal is final.
//
// Who can do what
//  - TTT admins (managePartnerUsers): everything, for any company.
//  - Primary: invite, resend and revoke invites, remove Members, hand the
//    Primary role to an Active Member.
//  - Member: invite teammates, resend or revoke invites they sent, leave.
import "server-only";
import { randomBytes } from "crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { getMembershipsForUser, getSystemRole, findReferralContactByClerkUserId } from "@/lib/airtable";
import { sendPartnerTeamInviteEmail, sendPartnerTeamJoinedEmail } from "@/lib/admin-notifications";
import { getPartnerById } from "./data";
import {
  createPartnerUser,
  getPartnerUserById,
  getPartnerUserByToken,
  getPartnerUsersByClerkId,
  getPartnerUsersByEmail,
  getPartnerUsersForPartner,
  updatePartnerUser,
} from "./partnerUsersData";
import type { MarketplacePartner, PartnerUser, PartnerUserRole } from "./types";

const INVITE_DAYS = 14;

export interface Actor {
  name: string;
  clerkUserId: string;
  email?: string;
  /** TTT admin acting from /admin/marketplace */
  isAdmin: boolean;
}

export type TeamResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const ok = <T,>(data: T): TeamResult<T> => ({ ok: true, data });
const fail = (error: string): TeamResult<never> => ({ ok: false, error });

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

function inviteExpiry(): string {
  return new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString();
}

export function inviteUrl(token: string): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim();
  return `${appUrl}/invite/team/${token}`;
}

export function isInviteExpired(u: PartnerUser): boolean {
  return !!u.inviteExpiresAt && new Date(u.inviteExpiresAt).getTime() < Date.now();
}

/** The Active row that gives this person access, if any. */
export async function getActiveMembership(clerkUserId: string): Promise<PartnerUser | null> {
  const rows = await getPartnerUsersByClerkId(clerkUserId);
  return rows.find((r) => r.status === "Active") ?? null;
}

/** The acting partner user's own Active row for this company, or null. */
async function viewerRow(partnerId: string, actor: Actor): Promise<PartnerUser | null> {
  if (actor.isAdmin) return null;
  const rows = await getPartnerUsersByClerkId(actor.clerkUserId);
  return rows.find((r) => r.status === "Active" && r.partnerId === partnerId) ?? null;
}

// ─── Clerk: portal routing flag ──────────────────────────────────────────────
// userType "partner" sends someone to the partner portal on every visit, so
// it's only set for people who have nowhere else to be (no staff role, no
// client projects), and taken away when their last access goes.

async function grantPortalFlag(clerkUserId: string): Promise<void> {
  const [role, memberships] = await Promise.all([
    getSystemRole(clerkUserId).catch(() => null),
    getMembershipsForUser(clerkUserId).catch(() => []),
  ]);
  if (role || memberships.length > 0) return;
  const clerk = await clerkClient();
  await clerk.users.updateUserMetadata(clerkUserId, { publicMetadata: { userType: "partner", onboardingComplete: null } });
}

async function clearPortalFlagIfNoAccess(clerkUserId: string): Promise<void> {
  const [stillActive, contact] = await Promise.all([
    getActiveMembership(clerkUserId).catch(() => null),
    findReferralContactByClerkUserId(clerkUserId).catch(() => null),
  ]);
  if (stillActive || contact) return;
  const clerk = await clerkClient();
  const user = await clerk.users.getUser(clerkUserId).catch(() => null);
  if ((user?.publicMetadata as { userType?: string } | undefined)?.userType !== "partner") return;
  await clerk.users.updateUserMetadata(clerkUserId, { publicMetadata: { userType: null } });
}

// ─── Legacy adoption ─────────────────────────────────────────────────────────

/**
 * Someone reached a company through the old CRM-contact login. Give them a
 * proper row (Primary if the company has no owner yet), unless they were
 * removed from this company, in which case they get no access.
 */
export async function adoptLegacyLogin(
  partner: MarketplacePartner,
  person: { clerkUserId: string; email: string; name: string; phone?: string; title?: string }
): Promise<PartnerUser | null> {
  const email = person.email.trim().toLowerCase();
  const rows = await getPartnerUsersForPartner(partner.id);
  const mine = rows.filter((r) => r.clerkUserId === person.clerkUserId || (email && r.email === email));
  if (mine.some((r) => r.status === "Removed")) return null;
  const active = mine.find((r) => r.status === "Active");
  if (active) return active;

  // Active at another company: the one-company rule wins
  const elsewhere = await getActiveMembership(person.clerkUserId).catch(() => null);
  if (elsewhere && elsewhere.partnerId !== partner.id) return null;

  const hasPrimary = rows.some((r) => r.status === "Active" && r.role === "Primary");
  const pending = mine.find((r) => r.status === "Invited" || r.status === "Revoked");
  const now = new Date().toISOString();
  const role: PartnerUserRole = hasPrimary ? "Member" : "Primary";
  if (pending) {
    return updatePartnerUser(pending.id, {
      clerkUserId: person.clerkUserId,
      status: "Active",
      role,
      acceptedAt: now,
      lastActiveAt: now,
      inviteToken: null,
      inviteExpiresAt: null,
      name: pending.name || person.name,
    });
  }
  return createPartnerUser({
    partnerId: partner.id,
    email,
    clerkUserId: person.clerkUserId,
    name: person.name,
    phone: person.phone,
    title: person.title,
    role,
    status: "Active",
    acceptedAt: now,
    lastActiveAt: now,
    notifyLeads: true,
    source: "Existing login",
  });
}

/** Marks the user active today (at most one write per day). */
export async function touchLastActive(row: PartnerUser): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (row.lastActiveAt?.slice(0, 10) === today) return;
  await updatePartnerUser(row.id, { lastActiveAt: new Date().toISOString() }).catch(() => {});
}

// ─── Invites ─────────────────────────────────────────────────────────────────

export async function inviteTeamMember(input: {
  partnerId: string;
  email: string;
  name: string;
  title?: string;
  role: PartnerUserRole;
  actor: Actor;
}): Promise<TeamResult<{ user: PartnerUser; reinvited: boolean }>> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address.");
  const name = input.name.trim();
  if (!name) return fail("Enter their name.");

  const partner = await getPartnerById(input.partnerId);
  if (!partner) return fail("That company wasn't found.");

  // Only admins can invite someone straight in as the Primary
  let role: PartnerUserRole = input.actor.isAdmin ? input.role : "Member";
  if (!input.actor.isAdmin) {
    const me = await viewerRow(partner.id, input.actor);
    if (!me) return fail("You don't have access to this company's team.");
  }

  const [companyRows, sameEmail] = await Promise.all([
    getPartnerUsersForPartner(partner.id),
    getPartnerUsersByEmail(email),
  ]);
  const elsewhere = sameEmail.find((r) => r.status === "Active" && r.partnerId !== partner.id);
  if (elsewhere) {
    const other = await getPartnerById(elsewhere.partnerId).catch(() => null);
    return fail(`${email} already belongs to ${other?.companyName ?? "another company"}. They need to be removed there first.`);
  }
  const existing = companyRows.find((r) => r.email === email);
  if (existing?.status === "Active") return fail(`${existing.name || email} is already on the team.`);
  if (existing?.status === "Removed" && !input.actor.isAdmin) {
    return fail(`${existing.name || email} was removed from this account. Ask Top Tier to add them back.`);
  }

  // A company with no owner gets one from its first invite
  if (!companyRows.some((r) => r.role === "Primary" && (r.status === "Active" || r.status === "Invited"))) role = "Primary";

  const now = new Date().toISOString();
  const inviteFields = {
    name,
    title: input.title?.trim() || undefined,
    role,
    status: "Invited" as const,
    inviteToken: newToken(),
    inviteExpiresAt: inviteExpiry(),
    invitedAt: now,
    lastInviteSentAt: now,
    invitedByName: input.actor.name,
    invitedByClerkId: input.actor.clerkUserId,
  };
  const user = existing
    ? await updatePartnerUser(existing.id, { ...inviteFields, removedAt: null, removedByName: null })
    : await createPartnerUser({
        partnerId: partner.id,
        email,
        notifyLeads: true,
        source: input.actor.isAdmin ? "Admin invite" : "Team invite",
        ...inviteFields,
      });

  await sendPartnerTeamInviteEmail({
    to: email,
    inviteeName: name,
    inviterName: input.actor.name,
    inviterEmail: input.actor.email,
    companyName: partner.companyName,
    role,
    acceptUrl: inviteUrl(user.inviteToken!),
    expiresDays: INVITE_DAYS,
  });
  return ok({ user, reinvited: !!existing });
}

async function loadForChange(userId: string, actor: Actor) {
  const target = await getPartnerUserById(userId);
  if (!target) return { error: "That person wasn't found." } as const;
  const me = actor.isAdmin ? null : await viewerRow(target.partnerId, actor);
  if (!actor.isAdmin && !me) return { error: "You don't have access to this company's team." } as const;
  return { target, me } as const;
}

export async function resendInvite(userId: string, actor: Actor): Promise<TeamResult<PartnerUser>> {
  const loaded = await loadForChange(userId, actor);
  if ("error" in loaded) return fail(loaded.error!);
  const { target, me } = loaded;
  if (target.status !== "Invited" && target.status !== "Revoked") return fail("Only pending invitations can be resent.");
  if (me && me.role !== "Primary" && target.invitedByClerkId !== me.clerkUserId) return fail("Only the account owner can resend someone else's invitation.");

  const partner = await getPartnerById(target.partnerId);
  if (!partner) return fail("That company wasn't found.");
  const now = new Date().toISOString();
  const user = await updatePartnerUser(target.id, {
    status: "Invited",
    inviteToken: newToken(),
    inviteExpiresAt: inviteExpiry(),
    lastInviteSentAt: now,
  });
  await sendPartnerTeamInviteEmail({
    to: user.email,
    inviteeName: user.name,
    inviterName: actor.name,
    inviterEmail: actor.email,
    companyName: partner.companyName,
    role: user.role,
    acceptUrl: inviteUrl(user.inviteToken!),
    expiresDays: INVITE_DAYS,
  });
  return ok(user);
}

export async function revokeInvite(userId: string, actor: Actor): Promise<TeamResult<PartnerUser>> {
  const loaded = await loadForChange(userId, actor);
  if ("error" in loaded) return fail(loaded.error!);
  const { target, me } = loaded;
  if (target.status !== "Invited") return fail("That invitation isn't pending.");
  if (me && me.role !== "Primary" && target.invitedByClerkId !== me.clerkUserId) return fail("Only the account owner can cancel someone else's invitation.");
  const user = await updatePartnerUser(target.id, { status: "Revoked", inviteToken: null, inviteExpiresAt: null });
  return ok(user);
}

/** Admin-only link copy, for when email isn't getting through. */
export async function getInviteLinkForAdmin(userId: string, actor: Actor): Promise<TeamResult<string>> {
  if (!actor.isAdmin) return fail("Not allowed.");
  const target = await getPartnerUserById(userId);
  if (!target || target.status !== "Invited" || !target.inviteToken) return fail("There's no pending invitation for this person.");
  if (isInviteExpired(target)) return fail("This invitation expired. Resend it to get a fresh link.");
  return ok(inviteUrl(target.inviteToken));
}

// ─── Membership changes ──────────────────────────────────────────────────────

export async function removeTeamMember(userId: string, actor: Actor): Promise<TeamResult<PartnerUser>> {
  const loaded = await loadForChange(userId, actor);
  if ("error" in loaded) return fail(loaded.error!);
  const { target, me } = loaded;
  if (target.status === "Removed") return fail("They've already been removed.");
  if (target.status !== "Active") return fail("Cancel the invitation instead.");
  if (me && me.role !== "Primary") return fail("Only the account owner can remove people.");
  if (me && target.id === me.id) return fail("You can't remove yourself as the account owner. Make someone else the owner first.");

  if (target.role === "Primary") {
    const others = (await getPartnerUsersForPartner(target.partnerId)).filter((r) => r.status === "Active" && r.id !== target.id);
    if (others.length > 0) return fail("This is the account owner. Make someone else the owner first, then remove them.");
  }

  const user = await updatePartnerUser(target.id, {
    status: "Removed",
    role: "Member",
    removedAt: new Date().toISOString(),
    removedByName: actor.name,
    inviteToken: null,
    inviteExpiresAt: null,
  });
  if (target.clerkUserId) await clearPortalFlagIfNoAccess(target.clerkUserId).catch((e) => console.error("[team] clear portal flag failed:", e));
  return ok(user);
}

/** A Member leaves the company on their own. */
export async function leaveTeam(actor: Actor, partnerId: string): Promise<TeamResult<undefined>> {
  const me = await viewerRow(partnerId, actor);
  if (!me) return fail("You're not on this team.");
  if (me.role === "Primary") return fail("You're the account owner. Make someone else the owner before leaving.");
  await updatePartnerUser(me.id, { status: "Removed", removedAt: new Date().toISOString(), removedByName: `${actor.name} (left)` });
  await clearPortalFlagIfNoAccess(actor.clerkUserId).catch(() => {});
  return ok(undefined);
}

/** Admin-only: give a removed person their access back. */
export async function restoreTeamMember(userId: string, actor: Actor): Promise<TeamResult<PartnerUser>> {
  if (!actor.isAdmin) return fail("Not allowed.");
  const target = await getPartnerUserById(userId);
  if (!target || (target.status !== "Removed" && target.status !== "Revoked")) return fail("Only removed people or cancelled invitations can be restored.");
  if (!target.clerkUserId) {
    // Never signed in: restoring means inviting again
    const r = await inviteTeamMember({ partnerId: target.partnerId, email: target.email, name: target.name, title: target.title, role: "Member", actor });
    return r.ok ? ok(r.data.user) : r;
  }
  const elsewhere = await getActiveMembership(target.clerkUserId);
  if (elsewhere && elsewhere.partnerId !== target.partnerId) return fail("They're active at another company now.");
  const user = await updatePartnerUser(target.id, { status: "Active", role: "Member", removedAt: null, removedByName: null });
  await grantPortalFlag(target.clerkUserId).catch(() => {});
  return ok(user);
}

export async function makePrimary(userId: string, actor: Actor): Promise<TeamResult<PartnerUser>> {
  const loaded = await loadForChange(userId, actor);
  if ("error" in loaded) return fail(loaded.error!);
  const { target, me } = loaded;
  if (me && me.role !== "Primary") return fail("Only the account owner can hand over ownership.");
  if (target.status !== "Active") return fail("Only someone who has joined can become the account owner.");
  if (target.role === "Primary") return ok(target);

  const rows = await getPartnerUsersForPartner(target.partnerId);
  await Promise.all(rows.filter((r) => r.role === "Primary" && r.id !== target.id).map((r) => updatePartnerUser(r.id, { role: "Member" })));
  const user = await updatePartnerUser(target.id, { role: "Primary" });
  return ok(user);
}

export async function setNotifyLeads(userId: string, notify: boolean, actor: Actor): Promise<TeamResult<PartnerUser>> {
  const loaded = await loadForChange(userId, actor);
  if ("error" in loaded) return fail(loaded.error!);
  const { target, me } = loaded;
  if (me && me.role !== "Primary" && me.id !== target.id) return fail("You can only change your own notifications.");
  return ok(await updatePartnerUser(target.id, { notifyLeads: notify }));
}

// ─── Accepting ───────────────────────────────────────────────────────────────

export type AcceptOutcome =
  | { ok: true; partner: MarketplacePartner; needsSetup: boolean }
  | { ok: false; reason: "invalid" | "expired" | "email-mismatch" | "other-company"; invitedEmail?: string; detail?: string };

export async function acceptInvite(token: string, clerkUserId: string): Promise<AcceptOutcome> {
  const invite = await getPartnerUserByToken(token);
  if (!invite || invite.status !== "Invited") return { ok: false, reason: "invalid" };
  if (isInviteExpired(invite)) return { ok: false, reason: "expired", invitedEmail: invite.email };

  const clerk = await clerkClient();
  const user = await clerk.users.getUser(clerkUserId);
  const emails = user.emailAddresses
    .filter((e) => e.verification?.status === "verified")
    .map((e) => e.emailAddress.toLowerCase());
  if (!emails.includes(invite.email)) return { ok: false, reason: "email-mismatch", invitedEmail: invite.email };

  const partner = await getPartnerById(invite.partnerId);
  if (!partner) return { ok: false, reason: "invalid" };

  const elsewhere = await getActiveMembership(clerkUserId);
  if (elsewhere && elsewhere.partnerId !== invite.partnerId) {
    const other = await getPartnerById(elsewhere.partnerId).catch(() => null);
    return { ok: false, reason: "other-company", detail: other?.companyName };
  }

  const rows = await getPartnerUsersForPartner(invite.partnerId);
  // Accepting a Primary invite hands over ownership
  if (invite.role === "Primary") {
    await Promise.all(rows.filter((r) => r.role === "Primary" && r.status === "Active" && r.id !== invite.id).map((r) => updatePartnerUser(r.id, { role: "Member" })));
  }
  // Duplicate rows for the same login (e.g. adopted earlier) give way to this one
  await Promise.all(rows.filter((r) => r.id !== invite.id && r.clerkUserId === clerkUserId && r.status === "Active").map((r) => updatePartnerUser(r.id, { status: "Removed", removedAt: new Date().toISOString(), removedByName: "Merged" })));

  const now = new Date().toISOString();
  const name = invite.name || [user.firstName, user.lastName].filter(Boolean).join(" ");
  await updatePartnerUser(invite.id, {
    clerkUserId,
    status: "Active",
    acceptedAt: now,
    lastActiveAt: now,
    inviteToken: null,
    inviteExpiresAt: null,
    name,
  });
  await grantPortalFlag(clerkUserId).catch((e) => console.error("[team] grant portal flag failed:", e));

  // Tell the owner and whoever invited them
  const notify = rows.filter((r) => r.status === "Active" && r.id !== invite.id && (r.role === "Primary" || r.clerkUserId === invite.invitedByClerkId));
  await sendPartnerTeamJoinedEmail({
    to: [...new Set(notify.map((r) => r.email))],
    memberName: name || invite.email,
    memberEmail: invite.email,
    companyName: partner.companyName,
  }).catch((e) => console.error("[team] joined email failed:", e));

  return { ok: true, partner, needsSetup: partner.lifecycleStatus === "Invited" };
}

/** People who should hear about a new lead: Active users who want lead alerts. */
export async function leadRecipients(partnerId: string): Promise<{ emails: string[]; clerkUserIds: string[] }> {
  const rows = (await getPartnerUsersForPartner(partnerId).catch(() => [])).filter((r) => r.status === "Active" && r.notifyLeads);
  return {
    emails: [...new Set(rows.map((r) => r.email).filter(Boolean))],
    clerkUserIds: [...new Set(rows.map((r) => r.clerkUserId).filter((v): v is string => !!v))],
  };
}
