export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse, after } from "next/server";
import { stepCoachingJob, failCoachingJob } from "@/lib/sales-coaching-report";

// Next leg of an "Activity Analysis for Me" report (see
// lib/sales-coaching-report.ts). Called only by the report itself, with the
// cron secret. Job state lives in Redis; only its id is passed.
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json().catch(() => ({ id: "" }));
  if (typeof id !== "string" || !/^[a-z0-9]{6,40}$/.test(id)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  after(async () => {
    try {
      await stepCoachingJob(id);
    } catch (e) {
      console.error("[sales-coaching] leg failed:", e);
      await failCoachingJob(id, e instanceof Error ? e.message : "The report failed partway through");
    }
  });

  return NextResponse.json({ ok: true });
}
