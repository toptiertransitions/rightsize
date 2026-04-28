export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import {
  getOutreachEnrollments, getOutreachStepsForSequence,
  updateOutreachEnrollment, createOutreachSend, getAllGmailTokens,
} from "@/lib/airtable";
import { getValidAccessToken, sendGmailMessage } from "@/lib/gmail";
import { clerkClient } from "@clerk/nextjs/server";

// Runs every 15 minutes — advances active enrollments whose next step is due.
// Email steps: sends via rep Gmail. Task steps: left for rep to action in My Day.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();
  const allActive = await getOutreachEnrollments({ status: "Active" });
  const due = allActive.filter(e => e.nextSendAt && e.nextSendAt <= now);

  if (due.length === 0) return NextResponse.json({ processed: 0 });

  // Cache Gmail tokens and user info by clerkUserId
  const gmailTokens = await getAllGmailTokens();
  const tokenMap = new Map(gmailTokens.map(t => [t.clerkUserId, t]));
  const clerk = await clerkClient();

  let processed = 0;
  let sent = 0;
  let failed = 0;

  // Group due enrollments by sequenceId to batch step fetches
  const seqIds = [...new Set(due.map(e => e.sequenceId))];
  const stepCache = new Map<string, Awaited<ReturnType<typeof getOutreachStepsForSequence>>>();
  await Promise.all(seqIds.map(async sid => {
    const steps = await getOutreachStepsForSequence(sid);
    stepCache.set(sid, steps);
  }));

  for (const enrollment of due) {
    const steps = stepCache.get(enrollment.sequenceId) ?? [];
    const currentStep = steps.find(s => s.stepOrder === enrollment.currentStep);
    if (!currentStep) continue;

    processed++;

    if (currentStep.channel === "Task") {
      // Task steps are not auto-sent — they appear in My Day.
      // Don't advance; the rep will click Done. Skip this enrollment.
      continue;
    }

    // Email step — send via rep's Gmail
    const token = tokenMap.get(enrollment.assignedToClerkId);
    if (!token) {
      console.warn(`[outreach-advance] No Gmail token for ${enrollment.assignedToClerkId}`);
      await updateOutreachEnrollment(enrollment.id, { status: "Paused" }).catch(() => {});
      continue;
    }

    try {
      const accessToken = await getValidAccessToken(enrollment.assignedToClerkId);
      const user = await clerk.users.getUser(enrollment.assignedToClerkId);
      const fromName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Top Tier Transitions";
      const fromEmail = user.emailAddresses[0]?.emailAddress ?? "";

      const subject = currentStep.subjectOverride || `Follow-up — Step ${enrollment.currentStep}`;
      const body = currentStep.bodyOverride || "";
      const personalizedBody = body.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => {
        if (k === "first_name") return enrollment.contactName.split(" ")[0] || enrollment.contactName;
        if (k === "last_name") return enrollment.contactName.split(" ").slice(1).join(" ");
        if (k === "rep_first_name") return user.firstName ?? "";
        return "";
      });

      const result = await sendGmailMessage({
        accessToken,
        to: enrollment.contactEmail,
        fromName,
        fromEmail,
        subject,
        htmlBody: personalizedBody.replace(/\n/g, "<br>"),
      });

      await createOutreachSend({
        enrollmentId: enrollment.id,
        stepOrder: enrollment.currentStep,
        sentAt: new Date().toISOString(),
        gmailMessageId: result.messageId,
        gmailThreadId: result.threadId,
        status: "Sent",
        errorMessage: "",
      });

      // Advance to next step
      const nextIdx = steps.findIndex(s => s.stepOrder > enrollment.currentStep);
      if (nextIdx === -1) {
        await updateOutreachEnrollment(enrollment.id, {
          status: "Completed",
          lastSentAt: new Date().toISOString(),
          nextSendAt: "",
        });
      } else {
        const nextStep = steps[nextIdx];
        const nextSendAt = new Date(Date.now() + nextStep.delayDays * 86400000 + nextStep.delayHours * 3600000).toISOString();
        await updateOutreachEnrollment(enrollment.id, {
          currentStep: nextStep.stepOrder,
          lastSentAt: new Date().toISOString(),
          nextSendAt,
        });
      }
      sent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[outreach-advance] Failed for enrollment ${enrollment.id}:`, msg);
      await createOutreachSend({
        enrollmentId: enrollment.id,
        stepOrder: enrollment.currentStep,
        sentAt: new Date().toISOString(),
        gmailMessageId: "",
        gmailThreadId: "",
        status: "Failed",
        errorMessage: msg,
      }).catch(() => {});
      if (msg === "GMAIL_TOKEN_REVOKED") {
        await updateOutreachEnrollment(enrollment.id, { status: "Paused" }).catch(() => {});
      }
      failed++;
    }
  }

  console.log(`[outreach-advance] processed=${processed} sent=${sent} failed=${failed}`);
  return NextResponse.json({ processed, sent, failed });
}
