import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createRoom, updateRoom, deleteRoom, getUserRoleForTenant, getSystemRole } from "@/lib/airtable";

import type { DensityLevel, RoomType } from "@/lib/types";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    tenantId: string;
    name: string;
    roomType: RoomType;
    squareFeet: number;
    density: DensityLevel;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { tenantId, name, roomType, squareFeet, density } = body;
  if (!tenantId || !roomType || !squareFeet) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  const resolvedName = (typeof name === "string" && name.trim()) ? name.trim() : roomType;

  // Verify the user has edit access (tenant role or system staff)
  const [tenantRole, sysRole] = await Promise.all([
    getUserRoleForTenant(userId, tenantId).catch(() => null),
    getSystemRole(userId).catch(() => null),
  ]);
  const canEdit =
    (tenantRole && ["Owner", "Collaborator", "TTTStaff", "TTTManager", "TTTAdmin"].includes(tenantRole)) ||
    sysRole === "TTTManager" ||
    sysRole === "TTTAdmin";
  if (!canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const room = await createRoom({ tenantId, name: resolvedName, roomType, squareFeet, density });
  return NextResponse.json({ room });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, tenantId, name, roomType, squareFeet, density } = await req.json();
  if (!id || !tenantId) return NextResponse.json({ error: "Missing id or tenantId" }, { status: 400 });

  const [tenantRole, sysRole] = await Promise.all([
    getUserRoleForTenant(userId, tenantId).catch(() => null),
    getSystemRole(userId).catch(() => null),
  ]);
  const canEdit =
    (tenantRole && ["Owner", "Collaborator", "TTTStaff", "TTTManager", "TTTAdmin"].includes(tenantRole)) ||
    (sysRole && ["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole));
  if (!canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const room = await updateRoom(id, {
    name: typeof name === "string" ? name.trim() : undefined,
    roomType: roomType ?? undefined,
    squareFeet: typeof squareFeet === "number" ? squareFeet : undefined,
    density: density ?? undefined,
  });
  return NextResponse.json({ room });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!id || !tenantId) return NextResponse.json({ error: "Missing id or tenantId" }, { status: 400 });

  const [tenantRole, sysRole] = await Promise.all([
    getUserRoleForTenant(userId, tenantId).catch(() => null),
    getSystemRole(userId).catch(() => null),
  ]);
  const canDelete =
    (tenantRole && ["Owner", "Collaborator", "TTTStaff", "TTTManager", "TTTAdmin"].includes(tenantRole)) ||
    (sysRole && ["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole));
  if (!canDelete) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await deleteRoom(id);
  return NextResponse.json({ success: true });
}
