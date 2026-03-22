import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getStaffMember, getSystemRole, updateStaffAvailability, getStaffMembers } from "@/lib/airtable";
import { buildTimeOffEmail } from "@/lib/email";
import { Resend } from "resend";
import type { TimeOffEntry } from "@/lib/types";

const resend = new Resend(process.env.RESEND_API_KEY);
const ALLOWED = ["TTTStaff", "TTTManager", "TTTAdmin"] as const;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!role || !ALLOWED.includes(role as typeof ALLOWED[number])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const member = await getStaffMember(userId).catch(() => null);
  if (!member) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });

  return NextResponse.json({
    staffMemberId: member.id,
    weeklySchedule: member.weeklySchedule ?? null,
    timeOff: member.timeOff ?? [],
  });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!role || !ALLOWED.includes(role as typeof ALLOWED[number])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const member = await getStaffMember(userId).catch(() => null);
  if (!member) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });

  let body: { weeklySchedule?: unknown; timeOff?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── Detect new time-off entries (compare IDs) ──────────────────────────────
  const incomingTimeOff = Array.isArray(body.timeOff) ? (body.timeOff as TimeOffEntry[]) : undefined;
  if (incomingTimeOff !== undefined && role === "TTTStaff") {
    const existingIds = new Set((member.timeOff ?? []).map((e) => e.id));
    const newEntries = incomingTimeOff.filter((e) => !existingIds.has(e.id));

    if (newEntries.length > 0) {
      // Fire-and-forget: send email to all TTTManager + TTTAdmin staff
      (async () => {
        try {
          const allStaff = await getStaffMembers();
          const recipientEmails = allStaff
            .filter((s) => s.isActive && (s.role === "TTTManager" || s.role === "TTTAdmin") && s.email)
            .map((s) => s.email);

          if (recipientEmails.length === 0) return;

          const html = buildTimeOffEmail({
            staffName: member.displayName,
            entries: newEntries,
            opsUrl: `${APP_URL}/admin/ops`,
          });

          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || "notifications@toptiertransitions.com",
            to: recipientEmails,
            subject: `Time Off Notice — ${member.displayName}`,
            html,
          });
        } catch (e) {
          console.error("Time-off notification email failed:", e);
        }
      })();
    }
  }

  const updated = await updateStaffAvailability(member.id, {
    weeklySchedule: body.weeklySchedule as never,
    timeOff: body.timeOff as never,
  });

  return NextResponse.json({
    weeklySchedule: updated.weeklySchedule ?? null,
    timeOff: updated.timeOff ?? [],
  });
}
