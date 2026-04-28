export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole, getOutreachSequenceById, getOutreachStepsForSequence,
  resolveOutreachContacts, batchCreateOutreachEnrollments,
} from "@/lib/airtable";
import type { OutreachContactFilter } from "@/lib/airtable";

async function requireSales(userId: string) {
  const role = await getSystemRole(userId);
  return ["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "") ? role : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireSales(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const filter: OutreachContactFilter = body.filter;

  const [sequence, steps] = await Promise.all([
    getOutreachSequenceById(id),
    getOutreachStepsForSequence(id),
  ]);
  if (!sequence) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  if (steps.length === 0) return NextResponse.json({ error: "Sequence has no steps" }, { status: 400 });

  const contacts = await resolveOutreachContacts(filter);
  if (contacts.length === 0) return NextResponse.json({ error: "No contacts match this audience" }, { status: 400 });

  const firstStep = steps[0];
  const now = new Date();
  const nextSendAt = new Date(now.getTime() + firstStep.delayDays * 86400000 + firstStep.delayHours * 3600000).toISOString();

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
    enrolledAt: now.toISOString(),
    lastSentAt: "",
    nextSendAt,
    lastReplyAt: "",
    lastReplySnippet: "",
    repliesAcknowledgedAt: "",
  }));

  const enrollments = await batchCreateOutreachEnrollments(enrollmentData);
  return NextResponse.json({ enrolled: enrollments.length });
}
