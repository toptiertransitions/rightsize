import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getStorageUnits, createStorageUnit, updateStorageUnit, deleteStorageUnit } from "@/lib/airtable";

async function guardManager(userId: string) {
  const role = await getSystemRole(userId).catch(() => null);
  return role === "TTTManager" || role === "TTTAdmin";
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await guardManager(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const units = await getStorageUnits().catch(() => []);
  return NextResponse.json({ units });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await guardManager(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { name, address, unitNumber, accessCode, lockSituation } = body;
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const unit = await createStorageUnit({ name: name.trim(), address, unitNumber, accessCode, lockSituation });
  return NextResponse.json({ unit });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await guardManager(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const unit = await updateStorageUnit(id, {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.address !== undefined ? { address: updates.address } : {}),
    ...(updates.unitNumber !== undefined ? { unitNumber: updates.unitNumber } : {}),
    ...(updates.accessCode !== undefined ? { accessCode: updates.accessCode } : {}),
    ...(updates.lockSituation !== undefined ? { lockSituation: updates.lockSituation } : {}),
  });
  return NextResponse.json({ unit });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await guardManager(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await deleteStorageUnit(id);
  return NextResponse.json({ ok: true });
}
