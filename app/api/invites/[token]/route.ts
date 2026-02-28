import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTenantById, createMembership, getUserRoleForTenant } from "@/lib/airtable";
import { verifyInviteToken } from "@/lib/invites";

interface RouteContext {
  params: Promise<{ token: string }>;
}

// GET /api/invites/[token] — validate token and return invite preview
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { token } = await params;

  let data: ReturnType<typeof verifyInviteToken>;
  try {
    data = verifyInviteToken(token);
  } catch (err) {
    return NextResponse.json(
      { valid: false, error: err instanceof Error ? err.message : "Invalid token" },
      { status: 400 }
    );
  }

  const tenant = await getTenantById(data.tenantId);
  if (!tenant) {
    return NextResponse.json({ valid: false, error: "Tenant not found" }, { status: 404 });
  }

  return NextResponse.json({
    valid: true,
    tenantId: data.tenantId,
    tenantName: tenant.name,
    role: data.role,
    expiresAt: data.expiresAt,
  });
}

// POST /api/invites/[token] — accept invite (requires auth)
export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await params;

  let data: ReturnType<typeof verifyInviteToken>;
  try {
    data = verifyInviteToken(token);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid token" },
      { status: 400 }
    );
  }

  // Check if already a member
  const existingRole = await getUserRoleForTenant(userId, data.tenantId);
  if (existingRole) {
    // Already a member — just redirect them
    return NextResponse.json({ alreadyMember: true, tenantId: data.tenantId });
  }

  await createMembership({ tenantId: data.tenantId, clerkUserId: userId, role: data.role });

  return NextResponse.json({ success: true, tenantId: data.tenantId });
}
