import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getStaffMemberById, getStaffMembers, updateStaffAvailability } from "@/lib/airtable";
import { buildTimeOffEmail } from "@/lib/email";
import { Resend } from "resend";
import type { TimeOffEntry } from "@/lib/types";

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!role || !["TTTManager", "TTTAdmin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden — Manager or Admin only" }, { status: 403 });
  }

  let body: { staffMemberId: string; entries: TimeOffEntry[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { staffMemberId, entries } = body;
  if (!staffMemberId || !Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "staffMemberId and entries required" }, { status: 400 });
  }

  const staffMember = await getStaffMemberById(staffMemberId).catch(() => null);
  if (!staffMember) {
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  }

  // Merge new entries with existing, avoiding duplicates by date
  const existingTimeOff = staffMember.timeOff ?? [];
  const existingDates = new Set(existingTimeOff.map((e) => e.date));
  const newEntries = entries.filter((e) => !existingDates.has(e.date));
  const merged = [...existingTimeOff, ...newEntries];

  const updated = await updateStaffAvailability(staffMemberId, { timeOff: merged });

  // Fire-and-forget: notify all TTTManager + TTTAdmin (same as self-submitted time off)
  if (newEntries.length > 0) {
    (async () => {
      try {
        const allStaff = await getStaffMembers();
        const recipientEmails = allStaff
          .filter((s) => s.isActive && (s.role === "TTTManager" || s.role === "TTTAdmin") && s.email)
          .map((s) => s.email);
        if (recipientEmails.length === 0) return;

        const html = buildTimeOffEmail({
          staffName: staffMember.displayName,
          entries: newEntries,
          opsUrl: `${APP_URL}/admin/ops`,
        });

        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || "notifications@toptiertransitions.com",
          to: recipientEmails,
          subject: `Time Off Notice — ${staffMember.displayName}`,
          html,
        });
      } catch (e) {
        console.error("[admin/staff-time-off] notification email failed:", e);
      }
    })();
  }

  return NextResponse.json({
    timeOff: updated.timeOff ?? [],
    added: newEntries.length,
  });
}
