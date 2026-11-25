import { NextRequest, NextResponse } from "next/server";
import { runResaleEmails } from "@/lib/resale-emails/engine";

// Resale update emails (see lib/resale-emails/engine.ts). Runs daily at
// 7:30 AM Central, after the automated price drops: vercel.json schedules it
// at 12:30 and 13:30 UTC so one lands on 7:30 in both CST and CDT, and the
// Chicago-time guard lets exactly one through.
//   ?force=1   skip the time guard (still requires CRON_SECRET)
//   ?dryRun=1  report what would happen; writes and sends nothing
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get("force") === "1";
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const chicagoMins =
    parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10) * 60 +
    parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  // 7:20–7:40 AM
  if (!force && !dryRun && (chicagoMins < 440 || chicagoMins > 460)) {
    return NextResponse.json({ skipped: true, reason: "Not ~7:30 AM Central" });
  }

  const result = await runResaleEmails({ preview: dryRun });
  return NextResponse.json({ dryRun, ...result });
}
