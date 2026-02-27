import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createRoom, getUserRoleForTenant } from "@/lib/airtable";
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
  if (!tenantId || !name || !roomType || !squareFeet) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Verify the user has edit access
  const role = await getUserRoleForTenant(userId, tenantId);
  if (!role || !["Owner", "Collaborator", "TTTStaff", "TTTAdmin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const room = await createRoom({ tenantId, name, roomType, squareFeet, density });
  return NextResponse.json({ room });
}
