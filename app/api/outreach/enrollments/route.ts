import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole, getOutreachEnrollments, updateOutreachEnrollment,
  getOutreachStepsForSequence,
} from "@/lib/airtable";
import type { OutreachEnrollmentStatus } from "@/lib/types";

async function requireSales(userId: string) {
  const role = await getSystemRole(userId);
  return ["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "") ? role : null;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireSales(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const assignedTo = req.nextUrl.searchParams.get("assignedTo");
  const status = req.nextUrl.searchParams.get("status") as OutreachEnrollmentStatus | null;
  const sequenceId = req.nextUrl.searchParams.get("sequenceId");

  const enrollments = await getOutreachEnrollments({
    assignedToClerkId: assignedTo === "me" ? userId : assignedTo ?? undefined,
    status: status ?? undefined,
    sequenceId: sequenceId ?? undefined,
  });
  return NextResponse.json({ enrollments });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireSales(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { id, action, snoozeDate, ...data } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  if (action === "done" || action === "skip") {
    // Advance to next step
    const enrollment = (await getOutreachEnrollments({})).find(e => e.id === id);
    if (!enrollment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const steps = await getOutreachStepsForSequence(enrollment.sequenceId);
    const nextStepIdx = steps.findIndex(s => s.stepOrder === enrollment.currentStep + 1);

    if (nextStepIdx === -1) {
      // Last step — complete
      const updated = await updateOutreachEnrollment(id, {
        status: "Completed",
        lastSentAt: new Date().toISOString(),
      });
      return NextResponse.json({ enrollment: updated });
    }

    const nextStep = steps[nextStepIdx];
    const nextSendAt = new Date(Date.now() + nextStep.delayDays * 86400000 + nextStep.delayHours * 3600000).toISOString();
    const updated = await updateOutreachEnrollment(id, {
      currentStep: nextStep.stepOrder,
      nextSendAt,
      lastSentAt: new Date().toISOString(),
    });
    return NextResponse.json({ enrollment: updated });
  }

  if (action === "snooze" && snoozeDate) {
    const updated = await updateOutreachEnrollment(id, { nextSendAt: new Date(snoozeDate).toISOString() });
    return NextResponse.json({ enrollment: updated });
  }

  if (action === "acknowledge") {
    const updated = await updateOutreachEnrollment(id, { repliesAcknowledgedAt: new Date().toISOString() });
    return NextResponse.json({ enrollment: updated });
  }

  if (action === "resume") {
    const updated = await updateOutreachEnrollment(id, {
      status: "Active",
      repliesAcknowledgedAt: new Date().toISOString(),
    });
    return NextResponse.json({ enrollment: updated });
  }

  const updated = await updateOutreachEnrollment(id, data);
  return NextResponse.json({ enrollment: updated });
}
