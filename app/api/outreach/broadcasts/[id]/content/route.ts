export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getOutreachSequenceById,
  getOutreachStepsForSequence,
  getOutreachEnrollments,
} from "@/lib/airtable";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const [sequence, steps, enrollments] = await Promise.all([
    getOutreachSequenceById(id),
    getOutreachStepsForSequence(id),
    getOutreachEnrollments({ sequenceId: id }),
  ]);

  if (!sequence) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let cfg: Record<string, unknown> = {};
  try { cfg = JSON.parse(sequence.triggerConfigJson || "{}"); } catch {}

  const step = steps[0];
  // Prefer cfg (Long Text field, no 512-char limit) with step as fallback for older broadcasts
  const subject = String(cfg.subject ?? step?.subjectOverride ?? "");
  const bodyHtml = String(cfg.bodyHtml ?? step?.bodyOverride ?? "");
  const channel = (cfg.channel as "Email" | "SMS") ?? "Email";
  const emailType: "branded" | "text" = /^\s*<!DOCTYPE|^\s*<html/i.test(bodyHtml) ? "branded" : "text";
  const attachmentUrl = String(cfg.attachmentUrl ?? "");

  let attachmentName = "";
  if (attachmentUrl) {
    try {
      attachmentName = decodeURIComponent(new URL(attachmentUrl).pathname.split("/").pop() || "");
    } catch { /* ignore */ }
  }

  const priorRecipientEmails = enrollments.map(e => e.contactEmail).filter(Boolean);

  return NextResponse.json({
    subject,
    bodyHtml,
    channel,
    emailType,
    ctaLink: "",
    attachmentUrl,
    attachmentName,
    priorRecipientEmails,
  });
}
