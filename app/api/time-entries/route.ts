import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import {
  getTimeEntries,
  getTimeEntryById,
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  getSystemRole,
} from "@/lib/airtable";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import type { FocusArea } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const systemRole = await getSystemRole(userId);
  if (!systemRole) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const canViewAll = hasPermission(systemRole, PERMISSIONS.TIME_VIEW_ALL);
  const filters: { clerkUserId?: string } = {};
  if (!canViewAll) {
    filters.clerkUserId = userId;
  } else {
    const staffId = req.nextUrl.searchParams.get("staffId");
    if (staffId) filters.clerkUserId = staffId;
  }

  try {
    const entries = await getTimeEntries(Object.keys(filters).length ? filters : undefined);
    return NextResponse.json({ entries });
  } catch (e) {
    console.error("getTimeEntries error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const systemRole = await getSystemRole(userId);
  if (!systemRole) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const canEditAll = hasPermission(systemRole, PERMISSIONS.TIME_EDIT_ALL);

  const user = await currentUser();
  const authenticatedStaffName = user
    ? (`${user.firstName ?? ""} ${user.lastName ?? ""}`).trim() ||
      user.emailAddresses?.[0]?.emailAddress ||
      "Staff"
    : "Staff";

  let body: {
    tenantId: string;
    projectName: string;
    date: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    focusArea: FocusArea;
    travelMiles?: number;
    travelMinutes?: number;
    notes?: string;
    staffUserId?: string;
    staffName?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { tenantId, projectName, date, startTime, endTime, durationMinutes, focusArea } = body;
  if (!tenantId || !projectName || !date || !startTime || !endTime || !focusArea) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const entryUserId = (canEditAll && body.staffUserId) ? body.staffUserId : userId;
  const staffName = (canEditAll && body.staffUserId && body.staffName) ? body.staffName : authenticatedStaffName;

  try {
    const entry = await createTimeEntry({
      clerkUserId: entryUserId,
      staffName,
      tenantId,
      projectName,
      date,
      startTime,
      endTime,
      durationMinutes,
      focusArea,
      travelMiles: body.travelMiles,
      travelMinutes: body.travelMinutes,
      notes: body.notes,
    });
    return NextResponse.json({ entry });
  } catch (e) {
    console.error("createTimeEntry error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const systemRole = await getSystemRole(userId);
  if (!systemRole) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const canEditAll = hasPermission(systemRole, PERMISSIONS.TIME_EDIT_ALL);

  let body: {
    id: string;
    tenantId?: string;
    projectName?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    durationMinutes?: number;
    focusArea?: FocusArea;
    travelMiles?: number;
    travelMinutes?: number;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await getTimeEntryById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canEditAll && existing.clerkUserId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const entry = await updateTimeEntry(id, fields);
    return NextResponse.json({ entry });
  } catch (e) {
    console.error("updateTimeEntry error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const systemRole = await getSystemRole(userId);
  if (!systemRole) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const canEditAll = hasPermission(systemRole, PERMISSIONS.TIME_EDIT_ALL);

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await getTimeEntryById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canEditAll && existing.clerkUserId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await deleteTimeEntry(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("deleteTimeEntry error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
