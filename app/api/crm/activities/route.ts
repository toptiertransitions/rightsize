import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getActivitiesForOpportunity, createActivity, updateActivity, deleteActivity } from "@/lib/airtable";

async function requireManager(userId: string) {
  const sysRole = await getSystemRole(userId);
  return sysRole === "TTTManager" || sysRole === "TTTAdmin";
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireManager(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const opportunityId = req.nextUrl.searchParams.get("opportunityId");
  if (!opportunityId) return NextResponse.json({ error: "Missing opportunityId" }, { status: 400 });

  const activities = await getActivitiesForOpportunity(opportunityId);
  return NextResponse.json({ activities });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireManager(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const activity = await createActivity({ ...body, createdByClerkId: userId });
  return NextResponse.json({ activity });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireManager(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const activity = await updateActivity(id, data);
  return NextResponse.json({ activity });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireManager(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await deleteActivity(id);
  return NextResponse.json({ ok: true });
}
