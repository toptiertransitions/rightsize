// Server side of the staff retention watch (see ./score.ts): gathers hours,
// targets, availability, shift invites and app activity for the active
// staff roster the Staff Goals tab shows, and scores each person.
import { clerkClient } from "@clerk/nextjs/server";
import { DateTime } from "luxon";
import { getPlanEntriesForDateRange, getStaffMembers, getTimeEntriesInRange } from "@/lib/airtable";
import { getSuspendedOrDeletedClerkUserIds } from "@/lib/staff-visibility";
import { BUSINESS_TIMEZONE } from "@/lib/shift-time";
import type { StaffMember, WeeklySchedule } from "@/lib/types";
import { WEEKS, RECENT_WEEKS, scoreStaff, type StaffEngagement } from "./score";

const ROSTER_ROLES = new Set(["TTTStaff", "TTTTeamLead", "TTTManager"]);
// Test logins, never real staff
const isTestAccount = (name: string) => /test/i.test(name);

function availableHours(schedule?: WeeklySchedule): number | null {
  if (!schedule) return null;
  let total = 0;
  for (const day of Object.values(schedule)) {
    if (!day?.available || !day.start || !day.end) continue;
    const [sh, sm] = day.start.split(":").map(Number);
    const [eh, em] = day.end.split(":").map(Number);
    const hrs = (eh * 60 + em - (sh * 60 + sm)) / 60;
    if (hrs > 0) total += hrs;
  }
  return Math.round(total * 10) / 10;
}

export interface StaffEngagementReport {
  today: string;
  weekStarts: string[];
  currentWeekStart: string;
  staff: StaffEngagement[];
}

export async function getStaffEngagement(): Promise<StaffEngagementReport> {
  const now = DateTime.now().setZone(BUSINESS_TIMEZONE);
  const today = now.toFormat("yyyy-MM-dd");
  const currentWeek = now.startOf("week"); // Monday
  const weekStarts = Array.from({ length: WEEKS }, (_, i) => currentWeek.minus({ weeks: WEEKS - i }).toFormat("yyyy-MM-dd"));
  const from = weekStarts[0];
  const upcomingTo = now.plus({ days: 14 }).toFormat("yyyy-MM-dd");
  const fourWeeksAgo = currentWeek.minus({ weeks: RECENT_WEEKS }).toFormat("yyyy-MM-dd");
  const in30 = now.plus({ days: 30 }).toFormat("yyyy-MM-dd");

  const [members, timeEntries, planEntries] = await Promise.all([
    getStaffMembers(),
    getTimeEntriesInRange(from, today),
    getPlanEntriesForDateRange(from, upcomingTo),
  ]);

  const candidates = members.filter((m) => m.isActive && ROSTER_ROLES.has(m.role) && !isTestAccount(m.displayName));
  const excluded = await getSuspendedOrDeletedClerkUserIds(candidates.map((m) => m.clerkUserId));
  const roster: StaffMember[] = candidates.filter((m) => !m.clerkUserId || !excluded.has(m.clerkUserId));

  // Last app activity, from Clerk
  const lastActive = new Map<string, string>();
  try {
    const clerk = await clerkClient();
    const ids = roster.map((m) => m.clerkUserId).filter(Boolean);
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await clerk.users.getUserList({ userId: ids.slice(i, i + 100), limit: 100 });
      for (const u of data) {
        const t = u.lastActiveAt ?? u.lastSignInAt;
        if (t) lastActive.set(u.id, DateTime.fromMillis(t).setZone(BUSINESS_TIMEZONE).toFormat("yyyy-MM-dd"));
      }
    }
  } catch (e) {
    console.error("[staff-engagement] Clerk activity lookup failed:", e); // scored as unknown
  }

  const weekIndex = (date: string) => {
    for (let i = WEEKS - 1; i >= 0; i--) if (date >= weekStarts[i]) return i;
    return -1;
  };
  const currentWeekStart = currentWeek.toFormat("yyyy-MM-dd");

  const staff = roster.map((m) => {
    const weeklyHours = new Array(WEEKS).fill(0) as number[];
    let currentWeekHours = 0;
    let lastHoursDate: string | null = null;
    for (const t of timeEntries) {
      if (t.clerkUserId !== m.clerkUserId || !m.clerkUserId) continue;
      const d = t.date.slice(0, 10);
      const hrs = (t.durationMinutes || 0) / 60;
      if (d >= currentWeekStart) currentWeekHours += hrs;
      else {
        const i = weekIndex(d);
        if (i >= 0) weeklyHours[i] += hrs;
      }
      if (hrs > 0 && (!lastHoursDate || d > lastHoursDate)) lastHoursDate = d;
    }

    const email = m.email.toLowerCase();
    let invitesAccepted = 0, invitesDeclined = 0, invitesUnanswered = 0, invitesLast4Weeks = 0, upcomingShifts = 0;
    for (const e of planEntries) {
      const h = email ? e.helpers?.find((x) => x.email.toLowerCase() === email) : undefined;
      if (!h) continue;
      if (e.date > today) {
        if (h.status === "accepted" && e.date <= upcomingTo) upcomingShifts++;
        continue;
      }
      if (h.status === "accepted") invitesAccepted++;
      else if (h.status === "declined") invitesDeclined++;
      else if (e.date < today) invitesUnanswered++;
      if (e.date >= fourWeeksAgo) invitesLast4Weeks++;
    }

    const timeOffDaysNext30 = new Set(
      (m.timeOff ?? []).filter((o) => o.date >= today && o.date <= in30).map((o) => o.date)
    ).size;

    return scoreStaff({
      id: m.id,
      name: m.displayName,
      role: m.role,
      hireDate: m.hireDate,
      targetWeeklyHours: m.targetWeeklyHours,
      minWeeklyHours: m.minWeeklyHours,
      maxWeeklyHours: m.maxWeeklyHours,
      weeklyHours: weeklyHours.map((h) => Math.round(h * 10) / 10),
      currentWeekHours: Math.round(currentWeekHours * 10) / 10,
      lastHoursDate,
      availableHours: availableHours(m.weeklySchedule),
      timeOffDaysNext30,
      invitesAccepted,
      invitesDeclined,
      invitesUnanswered,
      invitesLast4Weeks,
      upcomingShifts,
      lastActiveAt: (m.clerkUserId && lastActive.get(m.clerkUserId)) || null,
    }, today);
  });

  // Most at risk first; Dormant last, since they need a different conversation
  const rank = { High: 0, Watch: 1, Low: 2, Dormant: 3 } as const;
  staff.sort((a, b) => rank[a.tier] - rank[b.tier] || b.score - a.score || a.name.localeCompare(b.name));
  return { today, weekStarts, currentWeekStart, staff };
}
