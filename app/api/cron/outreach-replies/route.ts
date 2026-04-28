export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import {
  getOutreachEnrollments, getOutreachSendsForEnrollment,
  updateOutreachEnrollment, getAllGmailTokens,
} from "@/lib/airtable";
import { getValidAccessToken, getGmailThreadMessages } from "@/lib/gmail";
import { clerkClient } from "@clerk/nextjs/server";

// Runs every 30 minutes — scans Gmail threads for replies on active enrollments.
// On reply from a non-rep address: sets status=Replied, lastReplyAt, lastReplySnippet.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allActive = await getOutreachEnrollments({ status: "Active" });
  const withSends = allActive.filter(e => e.lastSentAt);

  if (withSends.length === 0) return NextResponse.json({ checked: 0, replied: 0 });

  const gmailTokens = await getAllGmailTokens();
  const tokenMap = new Map(gmailTokens.map(t => [t.clerkUserId, t]));
  const clerk = await clerkClient();

  const repEmailCache = new Map<string, string>();
  async function getRepEmail(clerkUserId: string): Promise<string> {
    if (repEmailCache.has(clerkUserId)) return repEmailCache.get(clerkUserId)!;
    try {
      const user = await clerk.users.getUser(clerkUserId);
      const email = user.emailAddresses[0]?.emailAddress ?? "";
      repEmailCache.set(clerkUserId, email);
      return email;
    } catch {
      return "";
    }
  }

  let checked = 0;
  let replied = 0;

  // Cap at 50 per run to stay within cron timeout
  const batch = withSends.slice(0, 50);

  for (const enrollment of batch) {
    const token = tokenMap.get(enrollment.assignedToClerkId);
    if (!token) continue;

    try {
      const sends = await getOutreachSendsForEnrollment(enrollment.id);
      const threaded = sends.filter(s => s.gmailThreadId && s.status === "Sent");
      if (threaded.length === 0) continue;

      checked++;
      const latest = threaded[threaded.length - 1];
      const accessToken = await getValidAccessToken(enrollment.assignedToClerkId);
      const repEmail = await getRepEmail(enrollment.assignedToClerkId);

      const messages = await getGmailThreadMessages(accessToken, latest.gmailThreadId);

      // Skip the first message (the one we sent); look for replies from non-rep addresses
      const reply = messages.slice(1).find(m => {
        const fromEmail = m.from.replace(/.*<(.+)>/, "$1").toLowerCase().trim();
        return fromEmail && fromEmail !== repEmail.toLowerCase();
      });

      if (reply) {
        const replyDate = reply.internalDate
          ? new Date(parseInt(reply.internalDate)).toISOString()
          : new Date().toISOString();
        await updateOutreachEnrollment(enrollment.id, {
          status: "Replied",
          lastReplyAt: replyDate,
          lastReplySnippet: reply.snippet.slice(0, 300),
        });
        replied++;
      }
    } catch (e) {
      console.error(`[outreach-replies] Failed for enrollment ${enrollment.id}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`[outreach-replies] checked=${checked} replied=${replied}`);
  return NextResponse.json({ checked, replied });
}
