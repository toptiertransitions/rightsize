import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPlanEntryById, getStaffMembers } from "@/lib/airtable";
import { respondToShift } from "@/lib/shift-response";
import { isShiftInPast } from "@/lib/shift-time";

export const runtime = "nodejs";

const ELIGIBLE_ROLES = ["TTTStaff", "TTTTeamLead"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ shiftId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { shiftId } = await params;

  let body: { status?: "accepted" | "declined"; comment?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.status !== "accepted" && body.status !== "declined") {
    return NextResponse.json({ error: "status must be \"accepted\" or \"declined\"" }, { status: 400 });
  }

  // Resolve the caller's identity server-side — never trust a client-
  // supplied userId or email. The shift's helpers array is keyed by email,
  // so this is also how we find which helper row (if any) is theirs.
  const allStaff = await getStaffMembers();
  const caller = allStaff.find((s) => s.clerkUserId === userId);
  if (!caller || !caller.isActive || !ELIGIBLE_ROLES.includes(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const entry = await getPlanEntryById(shiftId);
  if (!entry) {
    return NextResponse.json({ error: "This shift has been cancelled or no longer exists." }, { status: 404 });
  }

  const isInvited = (entry.helpers ?? []).some((h) => h.email.toLowerCase() === caller.email.toLowerCase());
  if (!isInvited) {
    return NextResponse.json({ error: "You're not invited to this shift." }, { status: 403 });
  }

  if (isShiftInPast(entry)) {
    return NextResponse.json({ error: "This shift has already happened." }, { status: 409 });
  }

  try {
    const result = await respondToShift(shiftId, caller.email, body.status, body.comment);
    return NextResponse.json({
      status: result.helper?.status ?? body.status,
      alreadyAtStatus: result.alreadyAtStatus,
    });
  } catch (e) {
    console.error("[shift-invites respond] failed:", e);
    return NextResponse.json({ error: "Failed to save your response. Please try again." }, { status: 500 });
  }
}
