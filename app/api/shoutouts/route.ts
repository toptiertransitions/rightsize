import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { getSystemRole, getStaffMembers, getInvoiceSettings } from "@/lib/airtable";
import { getSuspendedOrDeletedClerkUserIds } from "@/lib/staff-visibility";
import {
  canGiveShoutout,
  createShoutout,
  getRecentShoutouts,
  markShoutoutEmailed,
  SHOUTOUT_CC_ROLES,
  SHOUTOUT_MAX_LENGTH,
} from "@/lib/shoutouts";
import { buildShoutoutEmail } from "@/lib/shoutout-email";

// GET: team-wide feed, any TTT staff role.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await getSystemRole(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ shoutouts: await getRecentShoutouts() });
}

// POST: Team Leads, Sales, Managers and Admins only. Recipient is resolved from
// StaffRoles server-side; the CC list is never taken from the client.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId);
  if (!canGiveShoutout(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const recipientClerkId = typeof body.recipientClerkId === "string" ? body.recipientClerkId : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!recipientClerkId) return NextResponse.json({ error: "Pick someone to shout out" }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Write a message" }, { status: 400 });
  if (message.length > SHOUTOUT_MAX_LENGTH) {
    return NextResponse.json({ error: `Keep it under ${SHOUTOUT_MAX_LENGTH} characters` }, { status: 400 });
  }
  if (recipientClerkId === userId) return NextResponse.json({ error: "You can't shout out yourself" }, { status: 400 });

  const staff = (await getStaffMembers()).filter((s) => s.isActive && s.clerkUserId);
  const excluded = await getSuspendedOrDeletedClerkUserIds(staff.map((s) => s.clerkUserId));
  const active = staff.filter((s) => !excluded.has(s.clerkUserId));
  const recipient = active.find((s) => s.clerkUserId === recipientClerkId);
  if (!recipient || !recipient.email) return NextResponse.json({ error: "That team member wasn't found" }, { status: 404 });
  const author = staff.find((s) => s.clerkUserId === userId);
  const authorName = author?.displayName || "Top Tier Transitions";

  let shoutout;
  try {
    shoutout = await createShoutout({
      message,
      recipientClerkId: recipient.clerkUserId,
      recipientName: recipient.displayName,
      recipientEmail: recipient.email,
      authorClerkId: userId,
      authorName,
    });
  } catch (e) {
    console.error("[shoutouts POST] save failed:", e);
    return NextResponse.json({ error: "Couldn't save the shoutout" }, { status: 500 });
  }

  const to = recipient.email.toLowerCase();
  const cc = [...new Set(
    active
      .filter((s) => SHOUTOUT_CC_ROLES.includes(s.role) && s.email)
      .map((s) => s.email.toLowerCase())
      .filter((e) => e !== to),
  )];

  // Saved shoutouts stay on the feed even if the email fails; the client is told.
  let emailed = false;
  try {
    const settings = await getInvoiceSettings().catch(() => null);
    const email = buildShoutoutEmail({
      recipientName: recipient.displayName,
      authorName,
      message,
      appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim(),
      logoUrl: settings?.logoUrl || undefined,
    });
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: "Top Tier Transitions <noreply@toptiertransitions.com>",
      to,
      ...(cc.length ? { cc } : {}),
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    if (error) throw new Error(error.message);
    emailed = true;
    await markShoutoutEmailed(shoutout.id);
  } catch (e) {
    console.error("[shoutouts POST] email failed:", e);
  }

  console.log(`[shoutouts] ${shoutout.id} by ${userId} for ${recipient.clerkUserId}, emailed=${emailed}, cc=${cc.length}`);
  return NextResponse.json({ shoutout, emailed, ccCount: cc.length });
}
