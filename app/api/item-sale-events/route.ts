import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getItemSaleEvents, updateItemSaleEvent, deleteItemSaleEvent } from "@/lib/airtable";

async function requireStaff(userId: string) {
  const role = await getSystemRole(userId);
  return ["TTTStaff", "TTTManager", "TTTAdmin"].includes(role ?? "");
}

async function requireAdmin(userId: string) {
  const role = await getSystemRole(userId);
  return role === "TTTAdmin";
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireStaff(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const itemId = req.nextUrl.searchParams.get("itemId") ?? undefined;
  const events = await getItemSaleEvents(itemId);
  return NextResponse.json({ events });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireStaff(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, payoutPaid, notes } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const payoutPaidAt = payoutPaid ? new Date().toISOString() : undefined;
  const event = await updateItemSaleEvent(id, { payoutPaid, payoutPaidAt, notes });
  return NextResponse.json({ event });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireAdmin(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await deleteItemSaleEvent(id);
  return NextResponse.json({ ok: true });
}
