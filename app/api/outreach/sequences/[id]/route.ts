import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, updateOutreachSequence, deleteOutreachSequence } from "@/lib/airtable";

async function requireSales(userId: string) {
  const role = await getSystemRole(userId);
  return ["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "") ? role : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireSales(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const sequence = await updateOutreachSequence(id, body);
  return NextResponse.json({ sequence });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireSales(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await deleteOutreachSequence(id);
  return NextResponse.json({ ok: true });
}
