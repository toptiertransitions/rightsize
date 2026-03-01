import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getPlanEntriesForTenant,
  createPlanEntry,
  updatePlanEntry,
  deletePlanEntry,
  getPlanEntryById,
  getUserRoleForTenant,
} from "@/lib/airtable";
import type { PlanActivity } from "@/lib/types";

const EDIT_ROLES = ["Owner", "Collaborator", "TTTStaff", "TTTAdmin"];

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  const role = await getUserRoleForTenant(userId, tenantId);
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const entries = await getPlanEntriesForTenant(tenantId);
  return NextResponse.json({ entries });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    tenantId: string;
    date: string;
    activity: PlanActivity;
    roomId?: string;
    roomLabel?: string;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { tenantId, date, activity } = body;
  if (!tenantId || !date || !activity) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const role = await getUserRoleForTenant(userId, tenantId);
  if (!role || !EDIT_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const entry = await createPlanEntry({
    tenantId,
    date,
    activity,
    roomId: body.roomId,
    roomLabel: body.roomLabel,
    notes: body.notes,
  });
  return NextResponse.json({ entry });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    id: string;
    date?: string;
    activity?: PlanActivity;
    roomId?: string;
    roomLabel?: string;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await getPlanEntryById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const role = await getUserRoleForTenant(userId, existing.tenantId);
  if (!role || !EDIT_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const entry = await updatePlanEntry(id, fields);
  return NextResponse.json({ entry });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await getPlanEntryById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const role = await getUserRoleForTenant(userId, existing.tenantId);
  if (!role || !EDIT_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deletePlanEntry(id);
  return NextResponse.json({ ok: true });
}
