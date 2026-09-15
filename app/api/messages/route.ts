import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole, getTenantById, getStaffMembers } from "@/lib/airtable";
import type { StaffMember, Tenant, SystemRole } from "@/lib/types";
import type { ProjectMessage } from "@/lib/airtable-messages";
import {
  getProjectMessages,
  createProjectMessage,
  BROADCAST_TENANT_ID,
  TEAM_CHANNEL,
  channelParticipant,
} from "@/lib/airtable-messages";
import { canAccessChannel, isCommsHubRole } from "@/lib/thread-access";
import { getSuspendedOrDeletedClerkUserIds } from "@/lib/staff-visibility";
import { buildUrgentMessageEmail } from "@/lib/email";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";

async function checkAccess(userId: string, sysRole: SystemRole | null, tenantId: string, channel: string): Promise<boolean> {
  if (tenantId === BROADCAST_TENANT_ID) return isCommsHubRole(sysRole);
  return canAccessChannel(userId, sysRole, tenantId, channel);
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });
  const channel = req.nextUrl.searchParams.get("channel") || TEAM_CHANNEL;

  const sysRole = await getSystemRole(userId).catch(() => null);
  const allowed = await checkAccess(userId, sysRole, tenantId, channel);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [allMessages, staff] = await Promise.all([
    getProjectMessages(tenantId),
    getStaffMembers().catch(() => []),
  ]);
  const messages = allMessages.filter(m => m.channel === channel);
  const nameByClerkId = new Map(staff.map(s => [s.clerkUserId, s.displayName]));
  const enriched: Array<ProjectMessage & { authorName: string }> = messages.map(m => ({
    ...m,
    authorName: nameByClerkId.get(m.authorClerkId) ?? "Unknown",
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
  const managers = allStaff.filter(s => s.isActive && (s.role === "TTTManager" || s.role === "TTTAdmin"));

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
  const channel = body.channel || TEAM_CHANNEL;
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
    // Company-wide broadcasts: Manager/Admin only.
    if (sysRole !== "TTTManager" && sysRole !== "TTTAdmin") {
      return NextResponse.json({ error: "Forbidden — Manager or Admin only" }, { status: 403 });
    }
  } else {
    const allowed = await canAccessChannel(userId, sysRole, tenantId, channel);
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
  const message: ProjectMessage & { authorName: string } = { ...created, authorName: authorDisplayName };

  // Urgent messages email the relevant party for this channel — same
  // recipient logic already used for time-off notifications where it
  // applies (team channel), minus suspended/deleted staff.
  if (urgency === "Urgent") {
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
