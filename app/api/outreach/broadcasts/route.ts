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
import { Resend } from "resend";
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

  // Snapshot contact data for the after() callback before returning
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

  // Return immediately — enrollment creation + email sending happen after response
  after(async () => {
    try {
      const enrollments = await batchCreateOutreachEnrollments(enrollmentData);

      if (channel === "Email") {
        const accessToken = await getValidAccessToken(userId);
        const clerk = await clerkClient();
        const user = await clerk.users.getUser(userId);
        const fromName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Top Tier Transitions";
        const fromEmail = user.emailAddresses[0]?.emailAddress ?? "";

        let sent = 0;
        let failed = 0;
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
                company: enrollment.company ?? "",
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
            await updateOutreachEnrollment(enrollment.id, { status: "Completed", lastSentAt: new Date().toISOString() });
            sent++;
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
            failed++;
          }
        }

        // Confirmation email to sender
        if (fromEmail) {
          const resend = new Resend(process.env.RESEND_API_KEY);
          const statusLine = failed === 0
            ? `All ${sent} email${sent !== 1 ? "s" : ""} delivered successfully.`
            : `${sent} delivered, ${failed} failed.`;
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL ?? "noreply@toptiertransitions.com",
            to: fromEmail,
            subject: `Broadcast "${name}" sent — ${statusLine}`,
            html: `<p>Hi ${user.firstName ?? "there"},</p>
<p>Your broadcast <strong>"${name}"</strong> has finished sending.</p>
<p>${statusLine}</p>
${failed > 0 ? `<p style="color:#b91c1c">${failed} email${failed !== 1 ? "s" : ""} could not be delivered.</p>` : ""}
<p style="color:#6b7280;font-size:12px;margin-top:24px">Top Tier Transitions · Rightsize</p>`,
          }).catch(() => {});
        }
      } else {
        // SMS / manual task — mark all completed
        await Promise.all(enrollments.map(e =>
          updateOutreachEnrollment(e.id, { status: "Completed", lastSentAt: now }).catch(() => {})
        ));
      }
    } catch (err) {
      console.error("[broadcasts] after() error:", err);
    }
  });

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
  return body.replace(/\{\{([\w.]+)\}\}/g, (_, key) => vars[key] ?? "");
}
