import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getCrateLocations, createCrateLocation, updateCrateLocation, deleteCrateLocation } from "@/lib/airtable";

async function guardManager(userId: string) {
  const role = await getSystemRole(userId).catch(() => null);
  return role === "TTTManager" || role === "TTTAdmin";
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await guardManager(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const locations = await getCrateLocations().catch(() => []);
  return NextResponse.json({ locations });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await guardManager(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { name, type, crateCount, tenantId } = body;
  if (!name || !type) return NextResponse.json({ error: "name and type required" }, { status: 400 });

  const location = await createCrateLocation({ name, type, crateCount: Number(crateCount) || 0, tenantId });
  return NextResponse.json({ location });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await guardManager(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const location = await updateCrateLocation(id, {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.crateCount !== undefined ? { crateCount: Number(updates.crateCount) } : {}),
    ...(updates.tenantId !== undefined ? { tenantId: updates.tenantId } : {}),
  });
  return NextResponse.json({ location });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await guardManager(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await deleteCrateLocation(id);
  return NextResponse.json({ ok: true });
}
