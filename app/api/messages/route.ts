import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole, getTenantById, getStaffMembers } from "@/lib/airtable";
import type { StaffMember, Tenant } from "@/lib/types";
import type { ProjectMessage, MessageComment } from "@/lib/airtable-messages";
import {
  getProjectMessages,
  createProjectMessage,
  getCommentsForMessages,
  BROADCAST_TENANT_ID,
  TEAM_CHANNEL,
  channelParticipant,
  isDmTenant,
} from "@/lib/airtable-messages";
import { canAccessTenantChannel } from "@/lib/thread-access";
import { getSuspendedOrDeletedClerkUserIds } from "@/lib/staff-visibility";
import { buildUrgentMessageEmail } from "@/lib/email";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });
  const channel = req.nextUrl.searchParams.get("channel") || TEAM_CHANNEL;

  const sysRole = await getSystemRole(userId).catch(() => null);
  const allowed = await canAccessTenantChannel(userId, sysRole, tenantId, channel);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [allMessages, staff] = await Promise.all([
    getProjectMessages(tenantId),
    getStaffMembers().catch(() => []),
  ]);
  const messages = allMessages.filter(m => m.channel === channel);
  const nameByClerkId = new Map(staff.map(s => [s.clerkUserId, s.displayName]));

  const commentsByMessage = await getCommentsForMessages(messages.map(m => m.id));

  // Profile photos aren't in Airtable — batch-fetch from Clerk for every
  // distinct author across these messages AND their comments (same
  // enrichment pattern as the Ops staff roster in app/(protected)/staff/page.tsx).
  const authorIds = Array.from(new Set([
    ...messages.map(m => m.authorClerkId),
    ...Array.from(commentsByMessage.values()).flat().map(c => c.authorClerkId),
  ].filter(Boolean)));
  let photoByClerkId = new Map<string, string>();
  // Fallback name source: TTTAdmin can be granted via a hardcoded/env check
  // (see lib/config.ts isTTTAdmin) with no corresponding StaffRoles record
  // at all — for that account, and anyone else missing from the roster,
  // getStaffMembers() has no name, even though Clerk always does (hence
  // the photo resolving fine while the name showed "Unknown").
  let clerkNameByClerkId = new Map<string, string>();
  if (authorIds.length > 0) {
    try {
      const clerk = await clerkClient();
      const { data: clerkUsers } = await clerk.users.getUserList({ userId: authorIds, limit: 100 });
      photoByClerkId = new Map(clerkUsers.map(u => [u.id, u.imageUrl]));
      clerkNameByClerkId = new Map(clerkUsers.map(u => [
        u.id,
        [u.firstName, u.lastName].filter(Boolean).join(" ") || u.emailAddresses[0]?.emailAddress || "Unknown",
      ]));
    } catch { /* non-fatal — fall back to initials */ }
  }
  const resolveName = (clerkId: string) => nameByClerkId.get(clerkId) ?? clerkNameByClerkId.get(clerkId) ?? "Unknown";

  const enriched: Array<ProjectMessage & {
    authorName: string;
    authorPhotoUrl?: string;
    comments: Array<MessageComment & { authorName: string; authorPhotoUrl?: string }>;
  }> = messages.map(m => ({
    ...m,
    authorName: resolveName(m.authorClerkId),
    authorPhotoUrl: photoByClerkId.get(m.authorClerkId) || undefined,
    comments: (commentsByMessage.get(m.id) ?? []).map(c => ({
      ...c,
      authorName: resolveName(c.authorClerkId),
      authorPhotoUrl: photoByClerkId.get(c.authorClerkId) || undefined,
    })),
  }));
  return NextResponse.json({ messages: enriched });
}

/**
 * Who an Urgent message on this channel should email:
 *   team    — the project's Team Lead + all active Managers/Admins
 *   hq:X    — if X is posting, all active Managers/Admins; if HQ is
 *             replying, just X (the DM owner)
 *   lead:X  — the other DM participant only (crew <-> that project's
 *             Team Lead) — never Ops, and never appears on Open Issues
 */
function urgentRecipients(params: {
  channel: string;
  posterId: string;
  tenant: Tenant | null;
  allStaff: StaffMember[];
}): StaffMember[] {
  const { channel, posterId, tenant, allStaff } = params;
  const managers = allStaff.filter(s => s.isActive && (s.role === "TTTManager" || s.role === "TTTAdmin" || s.role === "TTTSales"));

  if (channel === TEAM_CHANNEL) {
    const teamLead = tenant?.teamLeadClerkId
      ? allStaff.find(s => s.isActive && s.clerkUserId === tenant.teamLeadClerkId)
      : undefined;
    return teamLead ? [...managers, teamLead] : managers;
  }

  const participant = channelParticipant(channel);
  if (!participant) return managers;

  if (channel.startsWith("hq:")) {
    if (posterId === participant) return managers; // staff -> HQ
    const owner = allStaff.find(s => s.isActive && s.clerkUserId === participant); // HQ replying -> notify the DM owner
    return owner ? [owner] : [];
  }

  if (channel.startsWith("lead:")) {
    const teamLeadId = tenant?.teamLeadClerkId;
    if (posterId === participant) {
      // crew -> team lead
      const lead = teamLeadId ? allStaff.find(s => s.isActive && s.clerkUserId === teamLeadId) : undefined;
      return lead ? [lead] : [];
    }
    // team lead -> crew member
    const crew = allStaff.find(s => s.isActive && s.clerkUserId === participant);
    return crew ? [crew] : [];
  }

  return managers;
}

function channelLabel(channel: string, projectName: string): string {
  if (channel === TEAM_CHANNEL) return projectName;
  if (channel.startsWith("hq:")) return `${projectName} — Private (HQ)`;
  if (channel.startsWith("lead:")) return `${projectName} — Private (Team Lead)`;
  return projectName;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);

  let body: { tenantId?: string; channel?: string; body?: string; urgency?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { tenantId, body: text, urgency } = body;
  // DMs are always one flat conversation per pair — never let a client
  // fragment one into sub-channels.
  const channel = (tenantId && isDmTenant(tenantId)) ? TEAM_CHANNEL : (body.channel || TEAM_CHANNEL);
  if (!tenantId || !text?.trim()) {
    return NextResponse.json({ error: "Missing tenantId or body" }, { status: 400 });
  }
  if (urgency !== "Normal" && urgency !== "Urgent" && urgency !== "FYI") {
    return NextResponse.json({ error: "Invalid urgency" }, { status: 400 });
  }
  if (tenantId === BROADCAST_TENANT_ID && channel !== TEAM_CHANNEL) {
    return NextResponse.json({ error: "Broadcasts don't support channels" }, { status: 400 });
  }

  if (tenantId === BROADCAST_TENANT_ID) {
    // Company-wide broadcasts: Manager/Admin/Sales only.
    if (sysRole !== "TTTManager" && sysRole !== "TTTAdmin" && sysRole !== "TTTSales") {
      return NextResponse.json({ error: "Forbidden — Manager, Admin, or Sales only" }, { status: 403 });
    }
  } else {
    const allowed = await canAccessTenantChannel(userId, sysRole, tenantId, channel);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const created = await createProjectMessage({
    tenantId,
    channel,
    authorClerkId: userId,
    body: text.trim(),
    urgency,
  });
  const clerk = await clerkClient();
  const authorUser = await clerk.users.getUser(userId).catch(() => null);
  const authorDisplayName = [authorUser?.firstName, authorUser?.lastName].filter(Boolean).join(" ") || "A staff member";
  const message: ProjectMessage & { authorName: string; authorPhotoUrl?: string; comments: MessageComment[] } = {
    ...created,
    authorName: authorDisplayName,
    authorPhotoUrl: authorUser?.imageUrl || undefined,
    comments: [],
  };

  // Urgent messages email the relevant party for this channel — same
  // recipient logic already used for time-off notifications where it
  // applies (team channel), minus suspended/deleted staff. Personal DMs
  // aren't part of the escalation system at all — a casual Slack-style
  // line between two people has no "Ops" to notify.
  if (urgency === "Urgent" && !isDmTenant(tenantId)) {
    (async () => {
      try {
        const tenant = tenantId === BROADCAST_TENANT_ID ? null : await getTenantById(tenantId).catch(() => null);
        const allStaff = await getStaffMembers();
        const recipients = urgentRecipients({ channel, posterId: userId, tenant, allStaff });

        const excludedIds = await getSuspendedOrDeletedClerkUserIds(recipients.map(s => s.clerkUserId));
        const recipientEmails = Array.from(new Set(
          recipients.filter(s => !excludedIds.has(s.clerkUserId) && s.email).map(s => s.email)
        ));
        if (recipientEmails.length === 0) return;

        const projectName = tenant?.name ?? "Company-wide";
        const label = channelLabel(channel, projectName);
        const html = buildUrgentMessageEmail({
          authorName: authorDisplayName,
          projectName: label,
          body: text.trim(),
          planUrl: tenant ? `${APP_URL}/plan?tenantId=${tenantId}` : `${APP_URL}/inbox`,
        });

        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || "notifications@toptiertransitions.com",
          to: recipientEmails,
          subject: `Urgent — ${label}`,
          html,
        });
      } catch (e) {
        console.error("[messages] urgent notification email failed:", e);
      }
    })();
  }

  return NextResponse.json({ message });
}
