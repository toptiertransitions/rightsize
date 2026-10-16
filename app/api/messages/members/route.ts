import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { canAccessProjectThread } from "@/lib/thread-access";
import { getProjectMembers } from "@/lib/messaging-hub";

// Who's in a project channel (Team Lead, crew, HQ) — same access rule as
// reading the channel itself.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!(await canAccessProjectThread(userId, sysRole, tenantId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(await getProjectMembers(tenantId));
}
