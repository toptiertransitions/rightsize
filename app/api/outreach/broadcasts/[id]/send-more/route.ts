export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getOutreachSequenceById,
  resolveOutreachContacts,
  getOutreachEnrollments,
  batchCreateOutreachEnrollments,
  updateOutreachEnrollment,
  createOutreachSend,
  createActivity,
  getStaffMembers,
  updateOutreachSequence,
} from "@/lib/airtable";
import { getValidAccessToken, sendGmailMessage } from "@/lib/gmail";
import { injectTracking } from "@/lib/tracking";
import { clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import type { OutreachContactFilter } from "@/lib/airtable";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: sequenceId } = await params;

  const body = await req.json();
  const {
    filter,
    subject,
    bodyHtml,
    channel,
    attachmentUrl,
    attachmentName,
    excludePriorRecipients,
  }: {
    filter: OutreachContactFilter;
    subject: string;
    bodyHtml: string;
    channel: "Email" | "SMS";
    attachmentUrl?: string;
    attachmentName?: string;
    excludePriorRecipients?: boolean;
  } = body;

  if (!filter || !bodyHtml) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const sequence = await getOutreachSequenceById(sequenceId);
  if (!sequence) return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });

  let cfg: Record<string, unknown> = {};
  try { cfg = JSON.parse(sequence.triggerConfigJson || "{}"); } catch {}

  let contacts: Awaited<ReturnType<typeof resolveOutreachContacts>>;
  try {
    contacts = await resolveOutreachContacts(filter);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to load contacts: ${msg}` }, { status: 500 });
  }

  if (excludePriorRecipients) {
    const priorEnrollments = await getOutreachEnrollments({ sequenceId });
    const priorEmails = new Set(
      priorEnrollments.map(e => e.contactEmail.toLowerCase()).filter(Boolean)
    );
    contacts = contacts.filter(c => !priorEmails.has((c.email ?? "").toLowerCase()));
  }

  if (contacts.length === 0) {
    return NextResponse.json(
      { error: "No new contacts to send to — all selected contacts already received this broadcast." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const name = sequence.name;
  const prevRecipientCount = Number(cfg.recipientCount ?? 0);

  const enrollmentData = contacts.map(c => ({
    sequenceId,
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

  // Update recipientCount immediately so the list reflects the new total
  await updateOutreachSequence(sequenceId, {
    triggerConfigJson: JSON.stringify({
      ...cfg,
      recipientCount: prevRecipientCount + contacts.length,
    }),
  }).catch(err => console.error("[send-more] recipientCount update failed:", err));

  after(async () => {
    try {
      const enrollments = await batchCreateOutreachEnrollments(enrollmentData);

      if (channel === "Email") {
        const accessToken = await getValidAccessToken(userId);
        const clerk = await clerkClient();
        const [user, staffList] = await Promise.all([
          clerk.users.getUser(userId),
          getStaffMembers().catch(() => []),
        ]);
        const fromName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Top Tier Transitions";
        const fromEmail = user.emailAddresses[0]?.emailAddress ?? "";
        const senderStaff = staffList.find(s => s.clerkUserId === userId);
        const repEmail = senderStaff?.email ?? fromEmail;
        const repPhone = senderStaff?.phone ?? "";

        let attachment: { data: Buffer; name: string; mimeType: string } | undefined;
        if (attachmentUrl) {
          try {
            const fileRes = await fetch(attachmentUrl);
            if (fileRes.ok) {
              const mimeType = fileRes.headers.get("content-type") || "application/octet-stream";
              const attachName = attachmentName || decodeURIComponent(new URL(attachmentUrl).pathname.split("/").pop() || "attachment");
              attachment = { data: Buffer.from(await fileRes.arrayBuffer()), name: attachName, mimeType };
            }
          } catch { /* best-effort */ }
        }

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
          await updateOutreachSequence(sequenceId, {
            triggerConfigJson: JSON.stringify({
              ...cfg,
              recipientCount: prevRecipientCount + contacts.length,
              sentCount: Number(cfg.sentCount ?? 0),
              failedCount: Number(cfg.failedCount ?? 0) + enrollments.length,
            }),
          }).catch(() => {});
          return;
        }

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
        let sent = 0;
        const failures: { contact: string; error: string }[] = [];

        for (const enrollment of enrollments) {
          try {
            const mergedHtml = applyMergeTags(bodyHtml, {
              first_name: enrollment.contactName.split(" ")[0] || enrollment.contactName,
              last_name: enrollment.contactName.split(" ").slice(1).join(" "),
              rep_first_name: user.firstName ?? "",
              rep_email: repEmail,
              rep_phone: repPhone,
              company: enrollment.company ?? "",
            });
            const htmlDoc = /^\s*<!DOCTYPE|^\s*<html/i.test(mergedHtml)
              ? mergedHtml
              : `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${mergedHtml}</body></html>`;
            const result = await sendGmailMessage({
              accessToken,
              to: enrollment.contactEmail,
              fromName,
              fromEmail,
              subject,
              htmlBody: injectTracking(htmlDoc, enrollment.id, baseUrl),
              attachment,
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
            createActivity({
              type: "Email",
              clientContactId: enrollment.contactId,
              note: `[Broadcast: "${name}"] ${subject}`,
              activityDate: new Date().toISOString(),
              createdByClerkId: userId,
              gmailMessageId: result.messageId,
              gmailThreadId: result.threadId,
              isGmailImported: false,
            }).catch(() => {});
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

        if (fromEmail) {
          const resend = new Resend(process.env.RESEND_API_KEY);
          const failed = failures.length;
          const statusLine = failed === 0
            ? `All ${sent} additional email${sent !== 1 ? "s" : ""} delivered successfully.`
            : `${sent} delivered, ${failed} failed.`;
          const failureRows = failures.map(f =>
            `<tr><td style="padding:4px 8px;color:#374151">${f.contact}</td><td style="padding:4px 8px;color:#b91c1c;font-size:12px">${f.error}</td></tr>`
          ).join("");
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL ?? "noreply@toptiertransitions.com",
            to: fromEmail,
            subject: `Broadcast "${name}" — additional send complete`,
            html: `<p>Hi ${user.firstName ?? "there"},</p>
<p>Your additional send for broadcast <strong>"${name}"</strong> has finished.</p>
<p>${statusLine}</p>
${failed > 0 ? `
<table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:8px">
  <thead><tr style="background:#f9fafb"><th style="padding:4px 8px;text-align:left;color:#6b7280">Recipient</th><th style="padding:4px 8px;text-align:left;color:#6b7280">Error</th></tr></thead>
  <tbody>${failureRows}</tbody>
</table>` : ""}
<p style="color:#6b7280;font-size:12px;margin-top:24px">Top Tier Transitions · Rightsize</p>`,
          }).catch((e) => console.error("[send-more] Resend confirmation failed:", e));
        }

        await updateOutreachSequence(sequenceId, {
          triggerConfigJson: JSON.stringify({
            ...cfg,
            recipientCount: prevRecipientCount + contacts.length,
            sentCount: Number(cfg.sentCount ?? 0) + sent,
            failedCount: Number(cfg.failedCount ?? 0) + failures.length,
          }),
        }).catch(err => console.error("[send-more] final count update failed:", err));
      } else {
        await Promise.all(enrollments.map(e =>
          updateOutreachEnrollment(e.id, { status: "Completed", lastSentAt: now }).catch(() => {})
        ));
        await updateOutreachSequence(sequenceId, {
          triggerConfigJson: JSON.stringify({
            ...cfg,
            recipientCount: prevRecipientCount + contacts.length,
            sentCount: Number(cfg.sentCount ?? 0) + enrollments.length,
            failedCount: Number(cfg.failedCount ?? 0),
          }),
        }).catch(err => console.error("[send-more] SMS count update failed:", err));
      }
    } catch (err) {
      console.error("[send-more] after() error:", err);
    }
  });

  return NextResponse.json({
    added: contacts.length,
    broadcastId: sequenceId,
    newRecipientCount: prevRecipientCount + contacts.length,
  });
}

function applyMergeTags(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{([\w.]+)\}\}/g, (_, key) => vars[key] ?? "");
}
