import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPlanEntryById, getUserRoleForTenant, updatePlanEntry, getRoomsForTenant, getTenantById, getSystemRole } from "@/lib/airtable";
import { createOrUpdateCalendarEvent, syncCalendarEventRSVPs, cancelCalendarEvent } from "@/lib/googleCalendar";
import type { PlanHelper } from "@/lib/types";

const EDIT_ROLES = ["Owner", "Collaborator", "TTTStaff", "TTTManager", "TTTAdmin"];

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    planEntryId: string;
    action: "send" | "sync" | "update" | "cancel";
    helpers?: PlanHelper[];
    startTime?: string;
    endTime?: string;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { planEntryId, action } = body;
  if (!planEntryId || !action) {
    return NextResponse.json({ error: "Missing planEntryId or action" }, { status: 400 });
  }

  const entry = await getPlanEntryById(planEntryId);
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole)) {
    const role = await getUserRoleForTenant(userId, entry.tenantId);
    if (!role || !EDIT_ROLES.includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Check Google credentials are configured
  if (
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET ||
    !process.env.GOOGLE_CALENDAR_REFRESH_TOKEN
  ) {
    return NextResponse.json(
      { error: "Google Calendar credentials not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALENDAR_REFRESH_TOKEN to environment variables." },
      { status: 503 }
    );
  }

  // Resolve project name + room name (shared by send and update)
  const resolveContext = async () => {
    const [tenant, rooms] = await Promise.all([
      getTenantById(entry.tenantId).catch(() => null),
      entry.roomId ? getRoomsForTenant(entry.tenantId).catch(() => []) : Promise.resolve([]),
    ]);
    const projectName = tenant?.name || "";
    const roomName = entry.roomLabel || rooms.find((r) => r.id === entry.roomId)?.name || "";
    const location = [tenant?.address, tenant?.city, tenant?.state, tenant?.zip]
      .filter(Boolean)
      .join(", ");
    return { projectName, roomName, location };
  };

  try {
    if (action === "send") {
      // Use helpers from request body (unsaved modal state) or fall back to Airtable
      const helpersToInvite = body.helpers?.length ? body.helpers : entry.helpers;
      if (!helpersToInvite?.length) {
        return NextResponse.json({ error: "No helpers to invite" }, { status: 400 });
      }

      // Persist any unsaved modal state (helpers, times, notes) to Airtable
      const patch: Parameters<typeof updatePlanEntry>[1] = {};
      if (body.helpers?.length) patch.helpers = body.helpers;
      if (body.startTime !== undefined) patch.startTime = body.startTime;
      if (body.endTime !== undefined) patch.endTime = body.endTime;
      if (body.notes !== undefined) patch.notes = body.notes;
      if (Object.keys(patch).length) await updatePlanEntry(planEntryId, patch);

      // Merge request-body values into entry so the calendar event uses current modal state
      const entryForCalendar = {
        ...entry,
        ...(body.startTime !== undefined && { startTime: body.startTime || undefined }),
        ...(body.endTime !== undefined && { endTime: body.endTime || undefined }),
        ...(body.notes !== undefined && { notes: body.notes }),
      };

      const { projectName, roomName, location } = await resolveContext();

      const eventId = await createOrUpdateCalendarEvent(
        entryForCalendar,
        helpersToInvite,
        roomName,
        entry.googleEventId,
        projectName,
        location,
      );

      const updated = await updatePlanEntry(planEntryId, { googleEventId: eventId });
      return NextResponse.json({ entry: updated });
    }

    if (action === "sync") {
      if (!entry.googleEventId) {
        return NextResponse.json({ error: "No calendar event to sync — send invites first" }, { status: 400 });
      }

      const rsvps = await syncCalendarEventRSVPs(entry.googleEventId);

      // Merge latest status + comment back into helpers
      const updatedHelpers: PlanHelper[] = (entry.helpers || []).map((h) => {
        const rsvp = rsvps.find((r) => r.email === h.email.toLowerCase());
        return rsvp ? { ...h, status: rsvp.status, comment: rsvp.comment } : h;
      });

      const updated = await updatePlanEntry(planEntryId, { helpers: updatedHelpers });
      return NextResponse.json({ entry: updated });
    }

    // Update: entry already saved to Airtable; just patch the calendar event
    if (action === "update") {
      if (!entry.googleEventId) return NextResponse.json({ entry }); // no event yet, no-op
      const { projectName, roomName, location } = await resolveContext();
      await createOrUpdateCalendarEvent(entry, entry.helpers || [], roomName, entry.googleEventId, projectName, location);
      return NextResponse.json({ entry });
    }

    // Cancel: delete the calendar event and notify all attendees
    if (action === "cancel") {
      if (!entry.googleEventId) return NextResponse.json({ ok: true }); // no event, no-op
      await cancelCalendarEvent(entry.googleEventId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    console.error("plan/calendar error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes("invalid_grant")) {
      return NextResponse.json(
        { error: "Google Calendar authorization has expired. A TTTAdmin needs to re-authorize by visiting /api/admin/calendar-auth." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
