export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getOutreachSequences,
  createOutreachSequence,
  createOutreachSequenceStep,
  resolveOutreachContacts,
  batchCreateOutreachEnrollments,
  updateOutreachEnrollment,
  createOutreachSend,
} from "@/lib/airtable";
import { getValidAccessToken } from "@/lib/gmail";
import { sendGmailMessage } from "@/lib/gmail";
import { clerkClient } from "@clerk/nextjs/server";
import type { OutreachContactFilter } from "@/lib/airtable";

async function requireSalesRole(userId: string) {
  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "")) return null;
  return role;
}

// List broadcasts — sequences where triggerConfigJson contains "isBroadcast":true
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireSalesRole(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const allSeqs = await getOutreachSequences(userId);
  const broadcasts = allSeqs.filter(s => {
    try { return JSON.parse(s.triggerConfigJson || "{}").isBroadcast === true; } catch { return false; }
  });
  return NextResponse.json({ broadcasts });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireSalesRole(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const {
    name,
    filter,
    subject,
    bodyHtml,
    templateId,
    channel,
  }: {
    name: string;
    filter: OutreachContactFilter;
    subject: string;
    bodyHtml: string;
    templateId?: string;
    channel: "Email" | "SMS";
  } = body;

  if (!name || !filter || !bodyHtml) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Resolve contacts
  const contacts = await resolveOutreachContacts(filter);
  if (contacts.length === 0) {
    return NextResponse.json({ error: "No contacts match this audience" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Create sequence record representing this broadcast
  const sequence = await createOutreachSequence({
    name,
    description: "",
    status: "Active",
    ownerClerkId: userId,
    triggerType: "Manual",
    triggerConfigJson: JSON.stringify({
      isBroadcast: true,
      sentAt: now,
      recipientCount: contacts.length,
      channel,
      filterJson: JSON.stringify(filter),
    }),
    defaultAudienceId: "",
    sendWindowJson: "",
    autoPauseOnReply: true,
  });

  // Create the single step
  await createOutreachSequenceStep({
    sequenceId: sequence.id,
    stepOrder: 1,
    channel: channel === "SMS" ? "Task" : "Email",
    delayDays: 0,
    delayHours: 0,
    templateId: templateId ?? "",
    subjectOverride: subject,
    bodyOverride: bodyHtml,
    taskTitle: channel === "SMS" ? `Send SMS: ${name}` : "",
    taskDescription: channel === "SMS" ? bodyHtml : "",
    taskType: channel === "SMS" ? "SMS" : "",
    threadWithPrevious: false,
  });

  // Batch-create enrollments
  const enrollmentData = contacts.map(c => ({
    sequenceId: sequence.id,
    contactType: filter.contactType,
    contactId: c.id,
    contactEmail: c.email,
    contactName: c.name,
    company: c.company ?? "",
    enrolledByClerkId: userId,
    assignedToClerkId: userId,
    status: "Active" as const,
    currentStep: 1,
    enrolledAt: now,
    lastSentAt: "",
    nextSendAt: "",
    lastReplyAt: "",
    lastReplySnippet: "",
    repliesAcknowledgedAt: "",
  }));
  const enrollments = await batchCreateOutreachEnrollments(enrollmentData);

  // Fire emails asynchronously after response
  if (channel === "Email") {
    after(async () => {
      try {
        const accessToken = await getValidAccessToken(userId);
        const clerk = await clerkClient();
        const user = await clerk.users.getUser(userId);
        const fromName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Top Tier Transitions";
        const fromEmail = user.emailAddresses[0]?.emailAddress ?? "";

        for (const enrollment of enrollments) {
          try {
            const result = await sendGmailMessage({
              accessToken,
              to: enrollment.contactEmail,
              fromName,
              fromEmail,
              subject,
              htmlBody: applyMergeTags(bodyHtml, {
                first_name: enrollment.contactName.split(" ")[0] || enrollment.contactName,
                last_name: enrollment.contactName.split(" ").slice(1).join(" "),
                rep_first_name: user.firstName ?? "",
              }),
            });
            await createOutreachSend({
              enrollmentId: enrollment.id,
              stepOrder: 1,
              sentAt: new Date().toISOString(),
              gmailMessageId: result.messageId,
              gmailThreadId: result.threadId,
              status: "Sent",
              errorMessage: "",
            });
            await updateOutreachEnrollment(enrollment.id, {
              status: "Completed",
              lastSentAt: new Date().toISOString(),
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await createOutreachSend({
              enrollmentId: enrollment.id,
              stepOrder: 1,
              sentAt: new Date().toISOString(),
              gmailMessageId: "",
              gmailThreadId: "",
              status: "Failed",
              errorMessage: msg,
            }).catch(() => {});
            await updateOutreachEnrollment(enrollment.id, { status: "Bounced" }).catch(() => {});
          }
        }
      } catch (err) {
        console.error("[broadcasts] send error:", err);
      }
    });
  } else {
    // SMS / task — mark all enrollments as Completed immediately (manual tasks)
    after(async () => {
      await Promise.all(enrollments.map(e =>
        updateOutreachEnrollment(e.id, { status: "Completed", lastSentAt: now }).catch(() => {})
      ));
    });
  }

  return NextResponse.json({
    broadcast: {
      id: sequence.id,
      name: sequence.name,
      recipientCount: contacts.length,
      sentAt: now,
      channel,
    },
  });
}

function applyMergeTags(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}
