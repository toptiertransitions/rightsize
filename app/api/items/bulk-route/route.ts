import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getUserRoleForTenant, updateItem } from "@/lib/airtable";
import type { PrimaryRoute } from "@/lib/types";

const EDIT_ROLES = ["Owner", "Collaborator", "TTTStaff", "TTTManager", "TTTAdmin"];

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemIds, tenantId, primaryRoute } = await req.json() as {
    itemIds: string[];
    tenantId: string;
    primaryRoute: PrimaryRoute;
  };

  if (!itemIds?.length || !tenantId || !primaryRoute) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const [sysRole, tenantRole] = await Promise.all([
    getSystemRole(userId).catch(() => null),
    getUserRoleForTenant(userId, tenantId).catch(() => null),
  ]);
  const isSystemStaff = sysRole && ["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole);
  if (!isSystemStaff && (!tenantRole || !EDIT_ROLES.includes(tenantRole))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results = await Promise.allSettled(
    itemIds.map(id => updateItem(id, { primaryRoute }))
  );

  const succeeded = results.filter(r => r.status === "fulfilled").length;
  const failed = results.filter(r => r.status === "rejected").length;
  return NextResponse.json({ succeeded, failed });
}
