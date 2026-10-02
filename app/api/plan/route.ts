import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getPlanEntriesForTenant,
  createPlanEntry,
  updatePlanEntry,
  deletePlanEntry,
  getPlanEntryById,
  getUserRoleForTenant,
  getSystemRole,
} from "@/lib/airtable";
import { notifyShiftChanged, notifyShiftCancelled } from "@/lib/shift-response";
import type { PlanActivity, PlanHelper, PlanEntryType } from "@/lib/types";

const EDIT_ROLES = ["Owner", "Collaborator", "TTTManager", "TTTAdmin"];

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
    address?: string;
    startTime?: string;
    endTime?: string;
    helpers?: PlanHelper[];
    entryType?: PlanEntryType;
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

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !["TTTManager", "TTTAdmin"].includes(sysRole)) {
    const role = await getUserRoleForTenant(userId, tenantId);
    if (!role || !EDIT_ROLES.includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const entry = await createPlanEntry({
      tenantId,
      date,
      activity,
      roomId: body.roomId,
      roomLabel: body.roomLabel,
      notes: body.notes,
      address: body.address,
      startTime: body.startTime,
      endTime: body.endTime,
      helpers: body.helpers,
      entryType: body.entryType,
    });
    return NextResponse.json({ entry });
  } catch (e) {
    console.error("createPlanEntry error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
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
    address?: string;
    startTime?: string;
    endTime?: string;
    helpers?: PlanHelper[];
    entryType?: PlanEntryType;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, ...fields } = body;
  // helpers needs special handling (array → updatePlanEntry accepts it directly)
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await getPlanEntryById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sysRolePatch = await getSystemRole(userId).catch(() => null);
  if (!sysRolePatch || !["TTTStaff", "TTTTeamLead", "TTTManager", "TTTAdmin"].includes(sysRolePatch)) {
    const role = await getUserRoleForTenant(userId, existing.tenantId);
    if (!role || !EDIT_ROLES.includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const entry = await updatePlanEntry(id, fields);

    // Additive push notification — never touches the Google Calendar
    // invite/update path (app/api/plan/calendar/route.ts), which keeps
    // doing exactly what it already did. Only fires for fields actually
    // present in this PATCH's body, compared against the pre-update values,
    // so a save that doesn't touch date/time/location never fires it.
    const dateChanged = fields.date !== undefined && fields.date !== existing.date;
    const timeChanged =
      (fields.startTime !== undefined && fields.startTime !== existing.startTime) ||
      (fields.endTime !== undefined && fields.endTime !== existing.endTime);
    const locationChanged = fields.address !== undefined && fields.address !== existing.address;

    if ((dateChanged || timeChanged || locationChanged) && entry.helpers?.length) {
      after(() => notifyShiftChanged(entry, { date: dateChanged, time: timeChanged, location: locationChanged }));
    }

    return NextResponse.json({ entry });
  } catch (e) {
    console.error("updatePlanEntry error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await getPlanEntryById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sysRoleDel = await getSystemRole(userId).catch(() => null);
  if (!sysRoleDel || !["TTTStaff", "TTTTeamLead", "TTTManager", "TTTAdmin"].includes(sysRoleDel)) {
    const role = await getUserRoleForTenant(userId, existing.tenantId);
    if (!role || !EDIT_ROLES.includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    await deletePlanEntry(id);

    // Additive push notification — never touches the Google Calendar cancel
    // path (app/api/plan/calendar/route.ts's "cancel" action, called
    // separately by the client when a googleEventId exists), which keeps
    // sending Google's own cancellation emails exactly as before. `existing`
    // was fetched above, before the delete, so it still has the helpers list.
    if (existing.helpers?.length) {
      after(() => notifyShiftCancelled(existing));
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("deletePlanEntry error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
