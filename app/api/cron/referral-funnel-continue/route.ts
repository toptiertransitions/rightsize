export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse, after } from "next/server";
import { stepFunnelJob, type FunnelJobState } from "@/lib/referral-funnel-report";

// Next leg of a "Referral Funnel for Me" report (see lib/referral-funnel-report.ts).
// Called only by the report itself, with the cron secret.
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let state: FunnelJobState;
  try {
    state = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!state?.quarter?.id || !state.recipientEmail || !Array.isArray(state.pending) || !Array.isArray(state.results) || !state.trends) {
    return NextResponse.json({ error: "Invalid job state" }, { status: 400 });
  }

  after(async () => {
    try {
      await stepFunnelJob(state);
    } catch (e) {
      console.error("[referral-funnel] continuation failed:", e);
    }
  });

  return NextResponse.json({ ok: true, pending: state.pending.length });
}
