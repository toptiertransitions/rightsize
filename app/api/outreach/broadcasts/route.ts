export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getOutreachSequences,
  createOutreachSequence,
  updateOutreachSequence,
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
  // Return all statuses — client decides what to show
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

  let contacts: Awaited<ReturnType<typeof resolveOutreachContacts>>;
  try {
    contacts = await resolveOutreachContacts(filter);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[broadcasts] resolveOutreachContacts failed:", msg);
    return NextResponse.json({ error: `Failed to load contacts: ${msg}` }, { status: 500 });
  }
  if (contacts.length === 0) {
    return NextResponse.json({ error: "No contacts match this audience" }, { status: 400 });
  }

  const now = new Date().toISOString();

  let sequence: Awaited<ReturnType<typeof createOutreachSequence>>;
  try {
    sequence = await createOutreachSequence({
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[broadcasts] createOutreachSequence failed:", msg);
    return NextResponse.json({ error: `Failed to create broadcast record: ${msg}` }, { status: 500 });
  }

  try {
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[broadcasts] createOutreachSequenceStep failed:", msg);
    return NextResponse.json({ error: `Failed to create step record: ${msg}` }, { status: 500 });
  }

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

        // Pre-flight: verify token has gmail.send scope before looping contacts
        const tokenInfoRes = await fetch(
          `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`
        ).catch(() => null);
        const tokenInfo = tokenInfoRes?.ok ? await tokenInfoRes.json() : null;
        const hasSendScope = String(tokenInfo?.scope ?? "").includes("gmail.send");

        if (!hasSendScope) {
          const scopeError = "Gmail reconnection required — your current connection does not have send permission.";
          await Promise.all(enrollments.map(e =>
            createOutreachSend({
              enrollmentId: e.id,
              stepOrder: 1,
              sentAt: new Date().toISOString(),
              gmailMessageId: "",
              gmailThreadId: "",
              status: "Failed",
              errorMessage: scopeError,
            }).catch(() => {})
          ));
          await Promise.all(enrollments.map(e =>
            updateOutreachEnrollment(e.id, { status: "Bounced" }).catch(() => {})
          ));
          if (fromEmail) {
            const resend = new Resend(process.env.RESEND_API_KEY);
            await resend.emails.send({
              from: process.env.RESEND_FROM_EMAIL ?? "noreply@toptiertransitions.com",
              to: fromEmail,
              subject: `Broadcast "${name}" failed — Gmail reconnection required`,
              html: `<p>Hi ${user.firstName ?? "there"},</p>
<p>Your broadcast <strong>"${name}"</strong> could not be sent because your Gmail account needs to be reconnected with send permission.</p>
<p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com"}/api/crm/gmail/auth" style="background:#166534;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">Reconnect Gmail →</a></p>
<p style="color:#6b7280;font-size:12px;margin-top:24px">After reconnecting, you can resend this broadcast from the Outreach tab.</p>
<p style="color:#6b7280;font-size:12px">Top Tier Transitions · Rightsize</p>`,
            }).catch(() => {});
          }
          await updateOutreachSequence(sequence.id, {
            triggerConfigJson: JSON.stringify({
              isBroadcast: true, sentAt: now, recipientCount: contacts.length,
              channel, filterJson: JSON.stringify(filter), sentCount: 0, failedCount: enrollments.length,
            }),
          }).catch(() => {});
          return;
        }

        let sent = 0;
        const failures: { contact: string; error: string }[] = [];
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
            failures.push({ contact: enrollment.contactEmail || enrollment.contactName, error: msg });
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

        // Confirmation email to sender
        if (fromEmail) {
          const resend = new Resend(process.env.RESEND_API_KEY);
          const failed = failures.length;
          const statusLine = failed === 0
            ? `All ${sent} email${sent !== 1 ? "s" : ""} delivered successfully.`
            : `${sent} delivered, ${failed} failed.`;
          const failureRows = failures.map(f =>
            `<tr><td style="padding:4px 8px;color:#374151">${f.contact}</td><td style="padding:4px 8px;color:#b91c1c;font-size:12px">${f.error}</td></tr>`
          ).join("");
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL ?? "noreply@toptiertransitions.com",
            to: fromEmail,
            subject: `Broadcast "${name}" sent — ${statusLine}`,
            html: `<p>Hi ${user.firstName ?? "there"},</p>
<p>Your broadcast <strong>"${name}"</strong> has finished sending.</p>
<p>${statusLine}</p>
${failed > 0 ? `
<p style="color:#b91c1c;font-weight:600;margin-top:16px">${failed} email${failed !== 1 ? "s" : ""} could not be delivered:</p>
<table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:8px">
  <thead><tr style="background:#f9fafb"><th style="padding:4px 8px;text-align:left;color:#6b7280">Recipient</th><th style="padding:4px 8px;text-align:left;color:#6b7280">Error</th></tr></thead>
  <tbody>${failureRows}</tbody>
</table>` : ""}
<p style="color:#6b7280;font-size:12px;margin-top:24px">Top Tier Transitions · Rightsize</p>`,
          }).catch(() => {});
        }

        // Write final sent/failed counts back into triggerConfigJson
        await updateOutreachSequence(sequence.id, {
          triggerConfigJson: JSON.stringify({
            isBroadcast: true,
            sentAt: now,
            recipientCount: contacts.length,
            channel,
            filterJson: JSON.stringify(filter),
            sentCount: sent,
            failedCount: failures.length,
          }),
        }).catch(err => console.error("[broadcasts] updateOutreachSequence failed:", err));
      } else {
        // SMS / manual task — mark all completed
        await Promise.all(enrollments.map(e =>
          updateOutreachEnrollment(e.id, { status: "Completed", lastSentAt: now }).catch(() => {})
        ));
        await updateOutreachSequence(sequence.id, {
          triggerConfigJson: JSON.stringify({
            isBroadcast: true,
            sentAt: now,
            recipientCount: contacts.length,
            channel,
            filterJson: JSON.stringify(filter),
            sentCount: enrollments.length,
            failedCount: 0,
          }),
        }).catch(err => console.error("[broadcasts] updateOutreachSequence (SMS) failed:", err));
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
