import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getClientContacts, getOpportunities, getReferralCompanies, getReferralContacts, getStaffMembers } from "@/lib/airtable";
import { buildCrmTasks } from "@/lib/crm-tasks";
import { buildCrmTasksReportEmail, centralToday, sectionCrmTasks } from "@/lib/crm-tasks-report";

// Weekly "Internal Report - Tasks from CRM" — one email per active TTTSales user,
// Fridays 9 AM Central, BCC Matt. Scheduled at 14:00 and 15:00 UTC (CDT / CST);
// the Chicago-time guard below lets exactly one of them through.
//   ?force=1  skip the Friday 9 AM guard (still requires CRON_SECRET)
//   ?dryRun=1 build the reports and return counts without sending

export const maxDuration = 60;

const BCC = "matt@toptiertransitions.com";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get("force") === "1";
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const weekday = parts.find(p => p.type === "weekday")?.value;
  const chicagoMins =
    parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10) * 60 +
    parseInt(parts.find(p => p.type === "minute")?.value ?? "0", 10);
  // Accept 8:50–9:10 AM Friday — wide enough for cron drift, narrow enough that only one of the two UTC crons fires
  if (!force && (weekday !== "Fri" || chicagoMins < 530 || chicagoMins > 550)) {
    return NextResponse.json({ skipped: true, reason: `Not Friday ~9 AM Central (${weekday} ${Math.floor(chicagoMins / 60)}:${String(chicagoMins % 60).padStart(2, "0")})` });
  }

  const [staffMembers, referralContacts, companies, clientContacts, opportunities] = await Promise.all([
    getStaffMembers(),
    getReferralContacts(),
    getReferralCompanies(),
    getClientContacts(),
    getOpportunities(),
  ]);

  const tasks = buildCrmTasks({ referralContacts, companies, clientContacts, opportunities });
  const salesUsers = staffMembers.filter(s => s.role === "TTTSales" && s.isActive && s.email);
  const today = centralToday(now);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
  const resend = new Resend(process.env.RESEND_API_KEY);

  const results: { name: string; email: string; tasks: number; sent: boolean; error?: string }[] = [];
  for (const user of salesUsers) {
    // Owner ids are Clerk ids, but match the Airtable staff id too in case an older write used it
    const mine = tasks.filter(t => t.ownerClerkId && (t.ownerClerkId === user.clerkUserId || t.ownerClerkId === user.id));
    const sections = sectionCrmTasks(mine, today);
    const result = { name: user.displayName, email: user.email, tasks: mine.length, sent: false } as (typeof results)[number];
    results.push(result);
    if (dryRun) continue;

    const html = buildCrmTasksReportEmail({ salesUserName: user.displayName, sections, today, appUrl });
    const { error } = await resend.emails.send({
      from: "Top Tier Transitions <hello@toptiertransitions.com>",
      to: user.email,
      ...(user.email.toLowerCase() !== BCC && { bcc: BCC }),
      subject: `Internal Report - Tasks from CRM - FYI for ${user.displayName}`,
      html,
    });
    if (error) {
      console.error("[crm-tasks-report] send failed for", user.email, error);
      result.error = error.message;
    } else {
      result.sent = true;
    }
    // Stay under Resend's per-second rate limit
    await new Promise(r => setTimeout(r, 600));
  }

  return NextResponse.json({ ok: true, today, dryRun, results });
}
