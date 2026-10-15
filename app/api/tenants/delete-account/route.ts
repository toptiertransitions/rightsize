import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTenantById, getUserRoleForTenant } from "@/lib/airtable";
import { deleteOwnAccount } from "@/lib/account-deletion";

// Home > Danger Zone > Delete Account (project Owners). Deletes only the
// person's own account, the same way as /delete-account; the project stays
// in place for the rest of the family and Top Tier.
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

  const result = await deleteOwnAccount(userId);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.reason === "staff" ? 403 : 500 });
  return NextResponse.json({ success: true });
}
