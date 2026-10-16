export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse, after } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { isTTTAdmin } from "@/lib/config";
import { buildCoachingJob, continueCoachingJob, getSalesReps, sendBuildFailureEmail } from "@/lib/sales-coaching-report";

// "Activity Analysis for Me": coaching report on one sales rep, emailed to
// whoever clicked. Starts the background job and returns right away
// (see lib/sales-coaching-report.ts). TTTAdmin only.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!isTTTAdmin(userId) && sysRole !== "TTTAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { repId } = await req.json().catch(() => ({ repId: "" }));
  const reps = await getSalesReps();
  const rep = reps.find((r) => r.id === repId);
  if (!rep) return NextResponse.json({ error: "Pick an active sales rep" }, { status: 400 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
  if (!email) return NextResponse.json({ error: "No email on your account" }, { status: 400 });

  after(async () => {
    try {
      const job = await buildCoachingJob({ repId: rep.id, recipientEmail: email, recipientName: user.firstName || "" });
      await continueCoachingJob(job.id, 0);
    } catch (e) {
      console.error("[sales-coaching] start failed:", e);
      await sendBuildFailureEmail(email, rep.name, e instanceof Error ? e.message : "Unknown error").catch(() => {});
    }
  });

  return NextResponse.json({ ok: true, email, repName: rep.name });
}
