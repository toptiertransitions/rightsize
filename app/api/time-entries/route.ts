import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import {
  getTimeEntries,
  getTimeEntryById,
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
} from "@/lib/airtable";
import { isTTTStaff, isTTTAdmin } from "@/lib/config";
import type { FocusArea } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isTTTStaff(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const filters: { clerkUserId?: string } = {};
  if (!isTTTAdmin(userId)) {
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
  if (!isTTTStaff(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = await currentUser();
  const staffName = user
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

  try {
    const entry = await createTimeEntry({
      clerkUserId: userId,
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
  if (!isTTTStaff(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  if (!isTTTAdmin(userId) && existing.clerkUserId !== userId) {
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
  if (!isTTTStaff(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await getTimeEntryById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isTTTAdmin(userId) && existing.clerkUserId !== userId) {
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
