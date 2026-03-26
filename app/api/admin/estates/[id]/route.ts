import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getEstateById, updateEstate, deleteEstate } from "@/lib/airtable";

async function requireTTT(userId: string) {
  const role = await getSystemRole(userId);
  return role === "TTTAdmin" || role === "TTTManager";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  void req;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireTTT(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const estate = await getEstateById(id);
  if (!estate) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ estate });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireTTT(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    const body = await req.json();
    const estate = await updateEstate(id, body);
    return NextResponse.json({ estate });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  void req;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireTTT(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    await deleteEstate(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
