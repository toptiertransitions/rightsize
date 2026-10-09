export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse, after } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { isTTTAdmin } from "@/lib/config";
import { getCurrentQuarterId } from "@/lib/war-room-report";
import { buildFunnelJob, stepFunnelJob } from "@/lib/referral-funnel-report";

// "Referral Funnel for Me": kicks off the background report and returns
// right away. Emailed to whoever clicked, usually within 10-15 minutes.
// Same access as "War Room for Me".
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!isTTTAdmin(userId) && !["TTTAdmin", "TTTManager"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
  if (!email) return NextResponse.json({ error: "No email on your account" }, { status: 400 });

  const quarterId = await getCurrentQuarterId();
  if (!quarterId) return NextResponse.json({ error: "No current quarter found" }, { status: 404 });

  const job = await buildFunnelJob({ quarterId, recipientEmail: email, recipientName: user.firstName || "" });
  if (!job) return NextResponse.json({ error: "Quarter not found" }, { status: 404 });

  after(async () => {
    try {
      await stepFunnelJob(job);
    } catch (e) {
      console.error("[referral-funnel] job failed:", e);
    }
  });

  return NextResponse.json({ ok: true, email, companies: job.pending.length, low: job.low.length, moves: job.allMoves.length });
}
