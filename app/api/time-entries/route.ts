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

function parseToMins(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

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
    focusArea?: FocusArea;
    travelMiles?: number;
    travelMinutes?: number;
    notes?: string;
    staffUserId?: string;
    staffName?: string;
    splits?: { focusArea: string; durationMinutes: number }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { tenantId, projectName, date, startTime, endTime, splits } = body;
  const focusArea = body.focusArea;
  if (!tenantId || !projectName || !date || !startTime || !endTime) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!focusArea && !(splits && splits.length > 1)) {
    return NextResponse.json({ error: "Missing focusArea" }, { status: 400 });
  }

  const entryUserId = (canEditAll && body.staffUserId) ? body.staffUserId : userId;
  const staffName = (canEditAll && body.staffUserId && body.staffName) ? body.staffName : authenticatedStaffName;

  const sharedFields = {
    clerkUserId: entryUserId,
    staffName,
    tenantId,
    projectName,
    date,
  };

  // ── Split path: create N entries sequentially ────────────────────────────
  if (splits && splits.length > 1) {
    try {
      let cursor = parseToMins(startTime);
      const created = [];
      for (let i = 0; i < splits.length; i++) {
        const splitStart = minsToTime(cursor);
        const splitEnd = minsToTime(cursor + splits[i].durationMinutes);
        cursor += splits[i].durationMinutes;
        const entry = await createTimeEntry({
          ...sharedFields,
          startTime: splitStart,
          endTime: splitEnd,
          durationMinutes: splits[i].durationMinutes,
          focusArea: splits[i].focusArea as FocusArea,
          travelMiles: i === 0 ? body.travelMiles : undefined,
          travelMinutes: i === 0 ? body.travelMinutes : undefined,
          notes: i === 0 ? body.notes : undefined,
        });
        created.push(entry);
      }
      return NextResponse.json({ entries: created, entry: created[0] });
    } catch (e) {
      console.error("createTimeEntry (split) error:", e);
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  // ── Single entry path ────────────────────────────────────────────────────
  try {
    const entry = await createTimeEntry({
      ...sharedFields,
      startTime,
      endTime,
      durationMinutes: body.durationMinutes,
      focusArea: focusArea!,
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
    splits?: { focusArea: string; durationMinutes: number }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, splits, ...fields } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await getTimeEntryById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canEditAll && existing.clerkUserId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Split path: delete original, create N new entries ───────────────────
  if (splits && splits.length > 1) {
    const startTime = fields.startTime ?? existing.startTime;
    const date = fields.date ?? existing.date;
    const tenantId = fields.tenantId ?? existing.tenantId;
    const projectName = fields.projectName ?? existing.projectName;
    try {
      await deleteTimeEntry(id);
      let cursor = parseToMins(startTime);
      const created = [];
      for (let i = 0; i < splits.length; i++) {
        const splitStart = minsToTime(cursor);
        const splitEnd = minsToTime(cursor + splits[i].durationMinutes);
        cursor += splits[i].durationMinutes;
        const newEntry = await createTimeEntry({
          clerkUserId: existing.clerkUserId,
          staffName: existing.staffName,
          tenantId,
          projectName,
          date,
          startTime: splitStart,
          endTime: splitEnd,
          durationMinutes: splits[i].durationMinutes,
          focusArea: splits[i].focusArea as FocusArea,
          travelMiles: i === 0 ? body.travelMiles : undefined,
          travelMinutes: i === 0 ? body.travelMinutes : undefined,
          notes: i === 0 ? (body.notes || undefined) : undefined,
        });
        created.push(newEntry);
      }
      return NextResponse.json({ entries: created, deletedId: id });
    } catch (e) {
      console.error("updateTimeEntry (split) error:", e);
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  // ── Single entry path ────────────────────────────────────────────────────
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
