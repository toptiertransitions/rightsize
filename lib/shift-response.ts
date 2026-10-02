import { getPlanEntryById, updatePlanEntry, getStaffMembers, getTenantById } from "./airtable";
import { buildShiftDeclinedEmail } from "./email";
import { sendPushToClerkUsers } from "./push-send";
import { formatShiftDateTime } from "./shift-time";
import { Resend } from "resend";
import type { PlanEntry, PlanHelper } from "./types";

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";

export type ShiftResponseStatus = "accepted" | "declined";

/**
 * Pure state transition: applies one email's response to a helpers array.
 * Shared by the bulk Google Calendar RSVP sync (app/api/plan/calendar/route.ts,
 * action "sync") and the in-app Accept/Decline flow (respondToShift below) —
 * there is exactly one place that decides what a "decline" transition is,
 * not two divergent implementations.
 */
export function applyHelperResponse(
  helpers: PlanHelper[],
  email: string,
  status: ShiftResponseStatus,
  comment?: string
): { helpers: PlanHelper[]; matched: PlanHelper | null; newlyDeclined: boolean } {
  const emailLower = email.toLowerCase();
  let matched: PlanHelper | null = null;
  let newlyDeclined = false;
  const updated = helpers.map((h) => {
    if (h.email.toLowerCase() !== emailLower) return h;
    newlyDeclined = status === "declined" && h.status !== "declined";
    matched = { ...h, status, ...(comment !== undefined ? { comment } : {}) };
    return matched;
  });
  return { helpers: updated, matched, newlyDeclined };
}

/**
 * The existing Manager/Admin decline email, now also pushed to their
 * registered devices — the one gap identified when the push system was
 * reviewed for shift-related notifications (decline was email-only before).
 */
export async function notifyShiftDeclined(entry: PlanEntry, helperEmail: string): Promise<void> {
  try {
    const [allStaff, tenant] = await Promise.all([
      getStaffMembers(),
      getTenantById(entry.tenantId).catch(() => null),
    ]);
    const managers = allStaff.filter((s) => s.isActive && (s.role === "TTTManager" || s.role === "TTTAdmin"));
    const recipientEmails = managers.filter((s) => s.email).map((s) => s.email);
    if (recipientEmails.length === 0) return;

    const projectName = tenant?.name ?? "Unknown Project";
    const planUrl = `${APP_URL}/plan?tenantId=${entry.tenantId}`;
    const staffMember = allStaff.find((s) => s.email.toLowerCase() === helperEmail.toLowerCase());

    if (process.env.RESEND_API_KEY) {
      const html = buildShiftDeclinedEmail({
        declinedByEmail: helperEmail,
        declinedByName: staffMember?.displayName,
        shiftDate: entry.date,
        activity: entry.activity,
        projectName,
        planUrl,
      });
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "notifications@toptiertransitions.com",
        to: recipientEmails,
        subject: `Shift Declined — ${projectName} · ${entry.date}`,
        html,
      });
    }

    await sendPushToClerkUsers(
      managers.map((s) => s.clerkUserId).filter(Boolean),
      {
        title: "Shift declined",
        body: `${staffMember?.displayName ?? helperEmail} declined ${entry.activity} — ${projectName}, ${entry.date}`,
        url: `/plan?tenantId=${entry.tenantId}`,
      },
      { type: "ShiftDeclined", shiftId: entry.id }
    );
  } catch (e) {
    console.error("[notifyShiftDeclined] failed:", e);
  }
}

// Shared by notifyShiftChanged/notifyShiftCancelled: resolves a shift's
// still-invited helpers (pending or accepted — a helper who already
// declined has opted out, same convention the "send"/"re-invite" push
// already follows) to the active TTTStaff/TTTTeamLead Clerk accounts among
// them. Helper emails with no matching active staff record (or no
// clerkUserId yet) are silently excluded, same as every other push path.
async function resolveActiveInviteeClerkIds(helpers: PlanHelper[] | undefined): Promise<string[]> {
  const invitedEmails = (helpers ?? [])
    .filter((h) => h.status !== "declined")
    .map((h) => h.email.toLowerCase());
  if (invitedEmails.length === 0) return [];

  const allStaff = await getStaffMembers();
  return allStaff
    .filter((s) => s.isActive && ["TTTStaff", "TTTTeamLead"].includes(s.role) && invitedEmails.includes(s.email.toLowerCase()))
    .map((s) => s.clerkUserId)
    .filter(Boolean);
}

/**
 * Additive to the existing Google Calendar invite flow, not a replacement —
 * Google's own calendar-update email still goes out exactly as before (see
 * app/api/plan/calendar/route.ts's "update" action). This just adds a push
 * for the three fields the client asked for specifically: date, time, and
 * location. Call from app/api/plan/route.ts's PATCH handler, which already
 * has the pre-update entry on hand to diff against.
 */
export async function notifyShiftChanged(
  entry: PlanEntry,
  changed: { date: boolean; time: boolean; location: boolean }
): Promise<void> {
  try {
    const clerkUserIds = await resolveActiveInviteeClerkIds(entry.helpers);
    if (clerkUserIds.length === 0) return;

    const parts = [
      changed.date && "date",
      changed.time && "time",
      changed.location && "location",
    ].filter(Boolean) as string[];
    if (parts.length === 0) return;

    const tenant = await getTenantById(entry.tenantId).catch(() => null);
    const projectName = tenant?.name ?? "";
    const whatChanged = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];

    await sendPushToClerkUsers(
      clerkUserIds,
      {
        title: "Shift updated",
        body: `${entry.activity}${projectName ? ` — ${projectName}` : ""}: ${whatChanged} changed. Now ${formatShiftDateTime(entry)}.`,
        url: `/shift-invite/${entry.id}`,
      },
      { type: "ShiftChanged", shiftId: entry.id }
    );
  } catch (e) {
    console.error("[notifyShiftChanged] failed:", e);
  }
}

/**
 * Additive to the existing Google Calendar cancel flow (cancelCalendarEvent
 * in app/api/plan/calendar/route.ts's "cancel" action, which already emails
 * every attendee via Google) — this just adds a push. Call with the entry
 * as it was *before* deletion (app/api/plan/route.ts's DELETE handler
 * already fetches it for the permission check).
 */
export async function notifyShiftCancelled(entry: PlanEntry): Promise<void> {
  try {
    const clerkUserIds = await resolveActiveInviteeClerkIds(entry.helpers);
    if (clerkUserIds.length === 0) return;

    const tenant = await getTenantById(entry.tenantId).catch(() => null);
    const projectName = tenant?.name ?? "";

    await sendPushToClerkUsers(
      clerkUserIds,
      {
        title: "Shift cancelled",
        body: `${entry.activity}${projectName ? ` — ${projectName}` : ""}, ${formatShiftDateTime(entry)} has been cancelled.`,
        url: `/plan?tenantId=${entry.tenantId}`,
      },
      { type: "ShiftCancelled", shiftId: entry.id }
    );
  } catch (e) {
    console.error("[notifyShiftCancelled] failed:", e);
  }
}

export interface RespondToShiftResult {
  entry: PlanEntry;
  helper: PlanHelper | null;
  newlyDeclined: boolean;
  alreadyAtStatus: boolean;
}

/**
 * The single entry point for "a helper responded to a shift" — called by
 * the in-app Accept/Decline API route, and by the bulk Google Calendar RSVP
 * sync (once per helper whose RSVP changed), so both paths produce the
 * exact same status values and the exact same decline notification.
 */
export async function respondToShift(
  planEntryId: string,
  email: string,
  status: ShiftResponseStatus,
  comment?: string
): Promise<RespondToShiftResult> {
  const entry = await getPlanEntryById(planEntryId);
  if (!entry) throw new Error("Shift not found");

  const existing = (entry.helpers ?? []).find((h) => h.email.toLowerCase() === email.toLowerCase());
  const alreadyAtStatus = existing?.status === status;

  const { helpers, matched, newlyDeclined } = applyHelperResponse(entry.helpers ?? [], email, status, comment);
  if (!matched) {
    return { entry, helper: null, newlyDeclined: false, alreadyAtStatus: false };
  }

  const updated = await updatePlanEntry(planEntryId, { helpers });

  if (newlyDeclined) {
    await notifyShiftDeclined(updated, email);
  }

  return { entry: updated, helper: matched, newlyDeclined, alreadyAtStatus };
}
