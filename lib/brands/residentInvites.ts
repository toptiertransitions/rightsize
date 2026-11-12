// Resident invites: a community (Active brand) emails someone who doesn't
// have an account or project yet. The email links to the community's join
// page with a signed invite id; signing up through it creates their own
// branded project in onboarding, and the invite is marked Joined (with the
// move date, if one was given, added as a Move Date key date).
//
// Sent by TTT Admins/Managers from Tenant Config, or by the community's own
// partner portal users when the brand is Active. Server-only.
import "server-only";
import { cookies } from "next/headers";
import { Resend } from "resend";
import { AIRTABLE_TABLES } from "@/lib/config";
import { createPlanEntry, getPlanEntriesForTenant, getTenantById, updateTenant } from "@/lib/airtable";
import { buildBrandedInviteEmail } from "@/lib/email";
import { getAllBrands, getBrandContactViews } from "./data";
import { attachBrandToUser, lockCommunityReferral } from "./attach";
import { signValue, verifyValue } from "./cookies";
import type { CommunityBrand } from "./shared";

export const RESIDENT_INVITE_COOKIE = "rz_resident_invite";
const INVITE_LINK_MAX_AGE = 60 * 60 * 24 * 30; // the emailed link works for 30 days

export type ResidentInviteStatus = "Invited" | "Joined" | "Canceled";
export type InviterSide = "Top Tier" | "Community";

export interface ResidentInvite {
  id: string;
  brandId: string;
  name: string;
  email: string;
  moveDate?: string;
  status: ResidentInviteStatus;
  invitedByName: string;
  invitedBySide: InviterSide;
  createdAt: string;
  lastSentAt?: string;
  sendCount: number;
  joinedAt?: string;
  tenantId?: string;
}

type Rec = { id: string; fields: Record<string, unknown> };

function at(path: string, options?: RequestInit) {
  return fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLES.RESIDENT_INVITES)}${path}`, {
    ...options,
    cache: "no-store",
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}`, "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
}

const str = (v: unknown) => (v != null ? String(v) : "");
const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

function mapInvite(r: Rec): ResidentInvite {
  const f = r.fields;
  return {
    id: r.id,
    brandId: str(f.BrandId),
    name: str(f.Name),
    email: str(f.Email),
    moveDate: str(f.MoveDate) || undefined,
    status: (str(f.Status) || "Invited") as ResidentInviteStatus,
    invitedByName: str(f.InvitedByName),
    invitedBySide: (str(f.InvitedBySide) || "Top Tier") as InviterSide,
    createdAt: str(f.CreatedAt),
    lastSentAt: str(f.LastSentAt) || undefined,
    sendCount: typeof f.SendCount === "number" ? f.SendCount : 0,
    joinedAt: str(f.JoinedAt) || undefined,
    tenantId: str(f.TenantId) || undefined,
  };
}

async function select(formula: string): Promise<ResidentInvite[]> {
  const out: Rec[] = [];
  let offset: string | undefined;
  do {
    const q = new URLSearchParams({ filterByFormula: formula });
    if (offset) q.set("offset", offset);
    const res = await at(`?${q}`);
    if (!res.ok) throw new Error(`ResidentInvites fetch failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as { records: Rec[]; offset?: string };
    out.push(...data.records);
    offset = data.offset;
  } while (offset);
  return out.map(mapInvite);
}

async function patch(id: string, fields: Record<string, unknown>): Promise<ResidentInvite> {
  const res = await at(`/${id}`, { method: "PATCH", body: JSON.stringify({ fields }) });
  if (!res.ok) throw new Error(`ResidentInvites update failed (${res.status}): ${await res.text()}`);
  return mapInvite(await res.json());
}

export async function getResidentInvites(brandId: string): Promise<ResidentInvite[]> {
  const rows = await select(`AND({BrandId} = "${esc(brandId)}", {Status} != "Canceled")`);
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getResidentInviteById(id: string): Promise<ResidentInvite | null> {
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return null;
  const res = await at(`/${id}`);
  if (!res.ok) return null;
  return mapInvite(await res.json());
}

export function residentInviteUrl(brand: Pick<CommunityBrand, "slug">, inviteId: string): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim();
  return `${appUrl}/join/${brand.slug}?ri=${encodeURIComponent(signValue(inviteId, INVITE_LINK_MAX_AGE))}`;
}

/** The invite id from a join link's ?ri= token, if it's genuine and unexpired. */
export function verifyInviteToken(token: string | null | undefined): string | null {
  return verifyValue(token ?? undefined);
}

export function inviteCookieValue(inviteId: string): string {
  return signValue(inviteId, INVITE_LINK_MAX_AGE);
}

// The email names the inviter only when it's someone at the community; an
// invite sent by Top Tier reads as coming from the community itself.
async function sendInviteEmail(brand: CommunityBrand, invite: ResidentInvite, inviter: { name: string; email?: string; side: InviterSide }): Promise<void> {
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com";
  const domain = fromEmail.split("@")[1] || "toptiertransitions.com";
  const sender = brand.displayName.replace(/[<>"]/g, "");
  const contacts = await getBrandContactViews(brand).catch(() => []);
  const firstName = invite.name.trim().split(/\s+/)[0] ?? "";
  const html = buildBrandedInviteEmail({
    brand: {
      displayName: brand.displayName,
      subtitle: brand.subtitle,
      logoUrl: brand.logoUrl,
      primaryColor: brand.primaryColor,
      secondaryColor: brand.secondaryColor,
      minimal: brand.topTierVisibility === "Minimal",
      welcomeMessage: brand.welcomeMessage,
      welcomeSenderName: brand.welcomeSenderName,
      welcomeSenderTitle: brand.welcomeSenderTitle,
    },
    inviterName: inviter.side === "Community" ? inviter.name : "",
    role: "Owner",
    inviteUrl: residentInviteUrl(brand, invite.id),
    isClientInvite: true,
    variant: "resident",
    recipientFirstName: firstName,
    contacts,
  });
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: `${sender} <${brand.slug}@${domain}>`,
    to: invite.email,
    subject: `${firstName ? `${firstName}, ` : ""}${sender} invited you to plan your move`,
    html,
    ...(inviter.email && inviter.email.toLowerCase() !== invite.email.toLowerCase() ? { replyTo: inviter.email } : {}),
  });
  if (error) throw new Error(`Email failed: ${error.message}`);
}

export async function createAndSendResidentInvite(params: {
  brand: CommunityBrand;
  name: string;
  email: string;
  moveDate?: string;
  inviter: { name: string; email?: string; clerkUserId: string; side: InviterSide };
}): Promise<ResidentInvite> {
  const email = params.email.trim().toLowerCase();
  const existing = (await select(`AND({BrandId} = "${esc(params.brand.id)}", LOWER({Email}) = "${esc(email)}", {Status} != "Canceled")`))[0];
  if (existing?.status === "Joined") throw new Error(`${existing.name || email} has already joined.`);
  if (existing) throw new Error(`${existing.name || email} was already invited. Use Resend instead.`);

  const now = new Date().toISOString();
  const res = await at("", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        BrandId: params.brand.id,
        Name: params.name.trim(),
        Email: email,
        ...(params.moveDate ? { MoveDate: params.moveDate } : {}),
        Status: "Invited",
        InvitedByName: params.inviter.name,
        InvitedByClerkId: params.inviter.clerkUserId,
        InvitedBySide: params.inviter.side,
        CreatedAt: now,
        SendCount: 0,
      },
    }),
  });
  if (!res.ok) throw new Error(`ResidentInvites create failed (${res.status}): ${await res.text()}`);
  const invite = mapInvite(await res.json());
  await sendInviteEmail(params.brand, invite, params.inviter);
  return patch(invite.id, { LastSentAt: new Date().toISOString(), SendCount: 1 });
}

export async function resendResidentInvite(brand: CommunityBrand, inviteId: string, inviter: { name: string; email?: string; side: InviterSide }): Promise<ResidentInvite> {
  const invite = await getResidentInviteById(inviteId);
  if (!invite || invite.brandId !== brand.id) throw new Error("Invite not found.");
  if (invite.status !== "Invited") throw new Error(invite.status === "Joined" ? "They've already joined." : "This invite was canceled.");
  await sendInviteEmail(brand, invite, inviter);
  return patch(invite.id, { LastSentAt: new Date().toISOString(), SendCount: invite.sendCount + 1 });
}

export async function cancelResidentInvite(brand: CommunityBrand, inviteId: string): Promise<void> {
  const invite = await getResidentInviteById(inviteId);
  if (!invite || invite.brandId !== brand.id) throw new Error("Invite not found.");
  if (invite.status === "Joined") throw new Error("They've already joined.");
  await patch(invite.id, { Status: "Canceled" });
}

/**
 * The name the community typed when inviting this user, so onboarding can
 * prefill "What's your name?". Read-only: the invite is claimed later, on
 * step 1. Matches the join-link cookie first, then an open invite for the
 * email.
 */
export async function getPendingResidentInviteName(email: string): Promise<{ firstName: string; lastName: string } | null> {
  try {
    const jar = await cookies();
    const cookieId = verifyValue(jar.get(RESIDENT_INVITE_COOKIE)?.value);
    let invite = cookieId ? await getResidentInviteById(cookieId) : null;
    if (!invite || invite.status !== "Invited") {
      const e = email.trim().toLowerCase();
      invite = e.includes("@") ? (await select(`AND(LOWER({Email}) = "${esc(e)}", {Status} = "Invited")`))[0] ?? null : null;
    }
    if (!invite || invite.status !== "Invited" || !invite.name.trim()) return null;
    const [firstName, ...rest] = invite.name.trim().split(/\s+/);
    return { firstName, lastName: rest.join(" ") };
  } catch {
    return null;
  }
}

/**
 * Called once the new user's project exists (onboarding step 1). Matches the
 * invite from the join-link cookie, or else an open invite for their email,
 * marks it Joined, makes sure the project carries the community's brand, and
 * adds the invite's move date as a Move Date key date. Best-effort; never
 * blocks onboarding.
 */
export async function claimResidentInvite(params: { clerkUserId: string; email: string; tenantId: string; inviteId?: string }): Promise<void> {
  try {
    const jar = await cookies();
    const cookieId = params.inviteId ?? verifyValue(jar.get(RESIDENT_INVITE_COOKIE)?.value);
    let invite = cookieId ? await getResidentInviteById(cookieId) : null;
    if (!invite || invite.status !== "Invited") {
      const email = params.email.trim().toLowerCase();
      invite = email.includes("@") ? (await select(`AND(LOWER({Email}) = "${esc(email)}", {Status} = "Invited")`))[0] ?? null : null;
    }
    if (jar.get(RESIDENT_INVITE_COOKIE)) jar.delete(RESIDENT_INVITE_COOKIE);
    if (!invite || invite.status !== "Invited") return;

    const brand = (await getAllBrands()).find((b) => b.id === invite!.brandId);
    if (brand?.status === "Active") {
      await attachBrandToUser(params.clerkUserId, brand).catch((e) => console.error("[resident invite] attach:", e));
      const tenant = await getTenantById(params.tenantId).catch(() => null);
      if (tenant && tenant.isTTT !== true && (!tenant.communityBrandId || tenant.communityBrandId === brand.id)) {
        if (!tenant.communityBrandId) await updateTenant(tenant.id, { communityBrandId: brand.id }).catch((e) => console.error("[resident invite] tenant brand:", e));
        await lockCommunityReferral(tenant.id, brand, params.clerkUserId).catch((e) => console.error("[resident invite] community referral:", e));
      }
    }

    if (invite.moveDate) {
      const entries = await getPlanEntriesForTenant(params.tenantId).catch(() => []);
      if (!entries.some((e) => e.entryType === "keydate" && e.activity === "Move Date")) {
        await createPlanEntry({ tenantId: params.tenantId, date: invite.moveDate, activity: "Move Date", entryType: "keydate", createdByUserId: params.clerkUserId })
          .catch((e) => console.error("[resident invite] move date:", e));
      }
    }

    await patch(invite.id, { Status: "Joined", JoinedAt: new Date().toISOString(), TenantId: params.tenantId, ClerkUserId: params.clerkUserId });
  } catch (e) {
    console.error("[resident invite] claim failed:", e);
  }
}
