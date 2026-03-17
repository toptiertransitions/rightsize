import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getStaffMember, getSystemRole, updateStaffAvailability } from "@/lib/airtable";

const ALLOWED = ["TTTStaff", "TTTManager", "TTTAdmin"] as const;

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

  const updated = await updateStaffAvailability(member.id, {
    weeklySchedule: body.weeklySchedule as never,
    timeOff: body.timeOff as never,
  });

  return NextResponse.json({
    weeklySchedule: updated.weeklySchedule ?? null,
    timeOff: updated.timeOff ?? [],
  });
}
