export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse, after } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { isTTTAdmin } from "@/lib/config";
import { buildWarRoomJob, getCurrentQuarterId, stepWarRoomJob } from "@/lib/war-room-report";

// "War Room for Me": kicks off the background report and returns right away.
// The report is emailed to whoever clicked, usually within 10-15 minutes.
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

  const job = await buildWarRoomJob({
    quarterId,
    recipientEmail: email,
    recipientName: user.firstName || "",
  });
  if (!job) return NextResponse.json({ error: "Quarter not found" }, { status: 404 });
  if (job.pending.length === 0) {
    return NextResponse.json({ error: "No War Room partners found this quarter" }, { status: 404 });
  }

  after(async () => {
    try {
      await stepWarRoomJob(job);
    } catch (e) {
      console.error("[war-room] job failed:", e);
    }
  });

  return NextResponse.json({ ok: true, email, partners: job.pending.length, quarter: job.quarter.label });
}
