export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse, after } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { isTTTAdmin } from "@/lib/config";
import { sendWeeklyWinsFailure, sendWeeklyWinsReport } from "@/lib/weekly-wins-report";

// "Weekly Wins for Me": builds the AI-written celebration email for the rolling
// last 7 days in the background and emails it to whoever clicked, to forward along.
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

  after(async () => {
    try {
      await sendWeeklyWinsReport(email);
    } catch (e) {
      console.error("[weekly-wins] failed:", e);
      await sendWeeklyWinsFailure(email, e instanceof Error ? e.message : "Unknown error");
    }
  });

  return NextResponse.json({ ok: true, email });
}
