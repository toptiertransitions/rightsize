import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserRoleForTenant } from "@/lib/airtable";
import { createInviteToken } from "@/lib/invites";
import type { InviteRole } from "@/lib/invites";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { tenantId: string; role: InviteRole };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { tenantId, role } = body;
  if (!tenantId || !role) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!["Collaborator", "Viewer"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Only Owners and Collaborators (+ TTT staff) may generate invites
  const userRole = await getUserRoleForTenant(userId, tenantId);
  if (!userRole || !["Owner", "Collaborator", "TTTStaff", "TTTAdmin"].includes(userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = createInviteToken({ tenantId, role, invitedBy: userId });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${appUrl}/invite?token=${token}`;

  return NextResponse.json({ inviteUrl });
}
