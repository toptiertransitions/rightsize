export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";
import { getPlanEntriesForDateRange, getStaffMembers, getTenantById, markShiftReminderSent } from "@/lib/airtable";
import { sendPushToClerkUsers } from "@/lib/push-send";
import { isReminderDue, formatShiftStartTime, BUSINESS_TIMEZONE } from "@/lib/shift-time";

// Runs every 5 minutes (vercel.json). Pushes a "Shift in 2 hours" reminder
// to every TTTStaff/TTTTeamLead helper whose shift's reminder window has
// arrived — only for helpers whose status is "accepted" (not declined, and
// not still "pending": the default per spec is no reminder on an
// unanswered invite). Idempotent via PlanHelper.reminderSentAt — see
// lib/airtable.ts markShiftReminderSent and lib/types.ts's comment on that
// field for how it resets on a reschedule.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = DateTime.utc();

  // ±1 day around "today" in the business zone — generous enough that a
  // reminder window crossing a Chicago calendar-day boundary (e.g. a shift
  // just after local midnight) is never missed by the Date-string filter
  // Airtable can actually query on.
  const todayChicago = now.setZone(BUSINESS_TIMEZONE);
  const from = todayChicago.minus({ days: 1 }).toFormat("yyyy-MM-dd");
  const to = todayChicago.plus({ days: 1 }).toFormat("yyyy-MM-dd");

  const [entries, allStaff] = await Promise.all([
    getPlanEntriesForDateRange(from, to),
    getStaffMembers(),
  ]);
  const staffByEmail = new Map(allStaff.map((s) => [s.email.toLowerCase(), s]));
  const tenantCache = new Map<string, { name: string; address: string }>();

  let sent = 0;

  for (const entry of entries) {
    if (!entry.helpers?.length) continue;

    for (const helper of entry.helpers) {
      if (!isReminderDue(entry, helper, now)) continue;

      const staff = staffByEmail.get(helper.email.toLowerCase());
      if (!staff || !staff.isActive || !["TTTStaff", "TTTTeamLead"].includes(staff.role)) continue;

      if (!tenantCache.has(entry.tenantId)) {
        const tenant = await getTenantById(entry.tenantId).catch(() => null);
        tenantCache.set(entry.tenantId, {
          name: tenant?.name ?? "",
          address: entry.address || [tenant?.address, tenant?.city, tenant?.state, tenant?.zip].filter(Boolean).join(", "),
        });
      }
      const { name: projectName, address } = tenantCache.get(entry.tenantId)!;

      await sendPushToClerkUsers(
        [staff.clerkUserId],
        {
          title: "Shift in 2 hours",
          body: [projectName, address].filter(Boolean).join(" — ") + ` · ${formatShiftStartTime(entry)}`,
          url: `/shift-invite/${entry.id}`,
        },
        { type: "ShiftReminder", shiftId: entry.id }
      );

      // Mark sent regardless of delivery outcome (logged separately by
      // sendPushToClerkUsers) — this field's job is "don't attempt this
      // reminder again," not "delivery was confirmed successful."
      await markShiftReminderSent(entry.id, helper.email, now.toISO()!);
      sent++;
    }
  }

  return NextResponse.json({ sent, entriesScanned: entries.length });
}
