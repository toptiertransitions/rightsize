import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getOpenHouseDates, createOpenHouseDate, updateOpenHouseDate, deleteOpenHouseDate } from "@/lib/airtable";

async function guardAdmin(userId: string) {
  const role = await getSystemRole(userId).catch(() => null);
  return role === "TTTAdmin";
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await guardAdmin(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const dates = await getOpenHouseDates(false).catch(() => []);
  return NextResponse.json({ dates });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await guardAdmin(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { date, timeRange, notes } = body;
  if (!date?.trim() || !timeRange?.trim()) {
    return NextResponse.json({ error: "date and timeRange required" }, { status: 400 });
  }
  const record = await createOpenHouseDate({ date: date.trim(), timeRange: timeRange.trim(), notes: notes?.trim() ?? "" });
  return NextResponse.json({ date: record });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await guardAdmin(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const record = await updateOpenHouseDate(id, {
    ...(updates.date !== undefined ? { date: updates.date } : {}),
    ...(updates.timeRange !== undefined ? { timeRange: updates.timeRange } : {}),
    ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
  });
  return NextResponse.json({ date: record });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await guardAdmin(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await deleteOpenHouseDate(id);
  return NextResponse.json({ ok: true });
}
