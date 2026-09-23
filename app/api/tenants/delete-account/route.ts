import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidateTag } from "next/cache";
import { getTenantById, getUserRoleForTenant, getMembershipsForUser, deleteMembership, updateTenant } from "@/lib/airtable";

// Self-service account deletion for client users — both TTT-managed and
// self-serve non-TTT projects. Archives the project (so TTT admins can
// still review it) but permanently deletes the Clerk account — unlike
// /api/tenants/delete-request, which only notifies staff and leaves both
// untouched.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { tenantId } = body as { tenantId?: string };
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  const [tenant, role] = await Promise.all([
    getTenantById(tenantId).catch(() => null),
    getUserRoleForTenant(userId, tenantId).catch(() => null),
  ]);

  if (!tenant) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (role !== "Owner") {
    return NextResponse.json({ error: "Only the project owner can delete their account" }, { status: 403 });
  }

  try {
    // 1. Archive the project — preserves the data for TTT review, doesn't erase it
    await updateTenant(tenantId, { isArchived: true });
    revalidateTag("tenants");

    // 2. Remove all Airtable project memberships for this user
    const memberships = await getMembershipsForUser(userId).catch(() => []);
    await Promise.all(memberships.map(m => deleteMembership(m.id)));

    // 3. Delete the Clerk account itself — must be last (point of no return)
    const clerk = await clerkClient();
    await clerk.users.deleteUser(userId);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[delete-account] error:", e);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
