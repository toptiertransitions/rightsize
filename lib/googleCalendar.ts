import { google } from "googleapis";
import type { PlanEntry, PlanHelper } from "./types";

// ─── Auth ──────────────────────────────────────────────────────────────────────
function getAuth() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN });
  return auth;
}

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "primary";
const TIMEZONE = "America/Denver";

// Add 1 day (for all-day event end dates)
function nextDay(date: string): string {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

// Add 1 hour to a HH:MM string
function plusOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ─── Create or update a Calendar event ────────────────────────────────────────
export async function createOrUpdateCalendarEvent(
  entry: PlanEntry,
  helpers: PlanHelper[],
  roomName?: string, // resolved room name for the summary
  existingEventId?: string,
): Promise<string> {
  const calendar = google.calendar({ version: "v3", auth: getAuth() });

  const room = roomName || entry.roomLabel || "";
  const summary = `Daily Focus: ${entry.activity}${room ? ` — ${room}` : ""}`;
  const description = [
    entry.notes || "",
    "",
    `Date: ${entry.date}`,
    entry.startTime
      ? `Time: ${formatTimeHuman(entry.startTime)}${entry.endTime ? ` – ${formatTimeHuman(entry.endTime)}` : ""}`
      : "",
    "",
    "Sent via Top Tier Transitions",
  ]
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();

  const hasTime = !!entry.startTime;
  const start = hasTime
    ? { dateTime: `${entry.date}T${entry.startTime}:00`, timeZone: TIMEZONE }
    : { date: entry.date };
  const end = hasTime
    ? {
        dateTime: `${entry.date}T${entry.endTime || plusOneHour(entry.startTime!)}:00`,
        timeZone: TIMEZONE,
      }
    : { date: nextDay(entry.date) };

  const requestBody = {
    summary,
    description,
    start,
    end,
    attendees: helpers.map((h) => ({ email: h.email })),
    guestCanInviteOthers: false,
    guestCanSeeOtherGuests: true,
  };

  if (existingEventId) {
    const res = await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: existingEventId,
      sendUpdates: "all",
      requestBody,
    });
    return res.data.id!;
  } else {
    const res = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      sendUpdates: "all",
      requestBody,
    });
    return res.data.id!;
  }
}

// ─── Sync RSVP statuses from Google Calendar ──────────────────────────────────
export async function syncCalendarEventRSVPs(
  eventId: string,
): Promise<{ email: string; status: PlanHelper["status"]; comment?: string }[]> {
  const calendar = google.calendar({ version: "v3", auth: getAuth() });
  const res = await calendar.events.get({ calendarId: CALENDAR_ID, eventId });

  return (res.data.attendees || []).map((a) => ({
    email: (a.email || "").toLowerCase(),
    status:
      a.responseStatus === "accepted"
        ? "accepted"
        : a.responseStatus === "declined"
        ? "declined"
        : "pending",
    comment: a.comment || undefined,
  }));
}

// "09:30" → "9:30 AM"
function formatTimeHuman(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
