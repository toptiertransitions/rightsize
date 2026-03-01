import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isTTTAdmin } from "@/lib/config";
import { createMembership, deleteMembership, updateMembershipRole, getAllMemberships } from "@/lib/airtable";
import type { UserRole } from "@/lib/types";

async function checkAdmin() {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) return null;
  return userId;
}

// POST — assign user to project
export async function POST(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { tenantId, clerkUserId, role } = await req.json();
  if (!tenantId || !clerkUserId || !role) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  const membership = await createMembership({ tenantId, clerkUserId, role: role as UserRole });
  return NextResponse.json({ membership });
}

// PATCH — change role
export async function PATCH(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { membershipId, role } = await req.json();
  if (!membershipId || !role) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  await updateMembershipRole(membershipId, role as UserRole);
  return NextResponse.json({ success: true });
}

// DELETE — remove one membership or all for a user
export async function DELETE(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { membershipId, clerkUserId } = await req.json();

  if (membershipId) {
    await deleteMembership(membershipId);
    return NextResponse.json({ success: true });
  }

  if (clerkUserId) {
    const all = await getAllMemberships();
    const toDelete = all.filter(m => m.userId === clerkUserId);
    await Promise.all(toDelete.map(m => deleteMembership(m.id)));
    return NextResponse.json({ success: true, removed: toDelete.length });
  }

  return NextResponse.json({ error: "Provide membershipId or clerkUserId" }, { status: 400 });
}
