import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole, getTenantById, getStaffMembers } from "@/lib/airtable";
import type { ProjectMessage } from "@/lib/airtable-messages";
import { getProjectMessages, createProjectMessage, BROADCAST_TENANT_ID } from "@/lib/airtable-messages";
import { canAccessProjectThread, isCommsHubRole } from "@/lib/thread-access";
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

  const sysRole = await getSystemRole(userId).catch(() => null);

  if (tenantId === BROADCAST_TENANT_ID) {
    if (!isCommsHubRole(sysRole)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else {
    const allowed = await canAccessProjectThread(userId, sysRole, tenantId);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [messages, staff] = await Promise.all([
    getProjectMessages(tenantId),
    getStaffMembers().catch(() => []),
  ]);
  const nameByClerkId = new Map(staff.map(s => [s.clerkUserId, s.displayName]));
  const enriched: Array<ProjectMessage & { authorName: string }> = messages.map(m => ({
    ...m,
    authorName: nameByClerkId.get(m.authorClerkId) ?? "Unknown",
  }));
  return NextResponse.json({ messages: enriched });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);

  let body: { tenantId?: string; body?: string; urgency?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { tenantId, body: text, urgency } = body;
  if (!tenantId || !text?.trim()) {
    return NextResponse.json({ error: "Missing tenantId or body" }, { status: 400 });
  }
  if (urgency !== "Normal" && urgency !== "Urgent" && urgency !== "FYI") {
    return NextResponse.json({ error: "Invalid urgency" }, { status: 400 });
  }

  if (tenantId === BROADCAST_TENANT_ID) {
    // Company-wide broadcasts: Manager/Admin only.
    if (sysRole !== "TTTManager" && sysRole !== "TTTAdmin") {
      return NextResponse.json({ error: "Forbidden — Manager or Admin only" }, { status: 403 });
    }
  } else {
    const allowed = await canAccessProjectThread(userId, sysRole, tenantId);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const created = await createProjectMessage({
    tenantId,
    authorClerkId: userId,
    body: text.trim(),
    urgency,
  });
  const clerk = await clerkClient();
  const authorUser = await clerk.users.getUser(userId).catch(() => null);
  const authorDisplayName = [authorUser?.firstName, authorUser?.lastName].filter(Boolean).join(" ") || "A staff member";
  const message: ProjectMessage & { authorName: string } = { ...created, authorName: authorDisplayName };

  // Urgent messages escalate to the project's Team Lead + all active
  // Managers/Admins by email — same recipient logic already used for
  // time-off notifications, minus suspended/deleted staff.
  if (urgency === "Urgent") {
    (async () => {
      try {
        const tenant = tenantId === BROADCAST_TENANT_ID ? null : await getTenantById(tenantId).catch(() => null);
        const allStaff = await getStaffMembers();
        const managers = allStaff.filter(s => s.isActive && (s.role === "TTTManager" || s.role === "TTTAdmin"));
        const teamLead = tenant?.teamLeadClerkId
          ? allStaff.find(s => s.isActive && s.clerkUserId === tenant.teamLeadClerkId)
          : undefined;
        const recipients = teamLead ? [...managers, teamLead] : managers;

        const excludedIds = await getSuspendedOrDeletedClerkUserIds(recipients.map(s => s.clerkUserId));
        const recipientEmails = Array.from(new Set(
          recipients.filter(s => !excludedIds.has(s.clerkUserId) && s.email).map(s => s.email)
        ));
        if (recipientEmails.length === 0) return;

        const html = buildUrgentMessageEmail({
          authorName: authorDisplayName,
          projectName: tenant?.name ?? "Company-wide",
          body: text.trim(),
          planUrl: tenant ? `${APP_URL}/plan?tenantId=${tenantId}` : `${APP_URL}/inbox`,
        });

        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || "notifications@toptiertransitions.com",
          to: recipientEmails,
          subject: `Urgent — ${tenant?.name ?? "Company-wide"}`,
          html,
        });
      } catch (e) {
        console.error("[messages] urgent notification email failed:", e);
      }
    })();
  }

  return NextResponse.json({ message });
}
