import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole, getOutreachEnrollments, getAllOutreachSequences,
  getAllOutreachSequenceSteps,
} from "@/lib/airtable";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [activeEnrollments, repliedEnrollments, allSequences, allSteps] = await Promise.all([
    getOutreachEnrollments({ assignedToClerkId: userId, status: "Active" }),
    getOutreachEnrollments({ assignedToClerkId: userId, status: "Replied" }),
    getAllOutreachSequences(),
    getAllOutreachSequenceSteps(),
  ]);

  const seqMap = new Map(allSequences.map(s => [s.id, s]));
  const stepsBySeq = new Map<string, typeof allSteps>();
  for (const step of allSteps) {
    if (!stepsBySeq.has(step.sequenceId)) stepsBySeq.set(step.sequenceId, []);
    stepsBySeq.get(step.sequenceId)!.push(step);
  }

  // Replies waiting — replied enrollments not yet acknowledged
  const repliesWaiting = repliedEnrollments
    .filter(e => !e.repliesAcknowledgedAt)
    .map(e => {
      const seq = seqMap.get(e.sequenceId);
      return {
        enrollmentId: e.id,
        contactName: e.contactName,
        contactEmail: e.contactEmail,
        company: e.company,
        sequenceName: seq?.name ?? "Unknown sequence",
        currentStep: e.currentStep,
        lastReplyAt: e.lastReplyAt,
        lastReplySnippet: e.lastReplySnippet,
      };
    });

  // Tasks today and overdue
  const tasksDue: {
    enrollmentId: string;
    contactName: string;
    contactEmail: string;
    company: string;
    sequenceName: string;
    totalSteps: number;
    currentStep: number;
    taskTitle: string;
    taskDescription: string;
    taskType: string;
    nextSendAt: string;
    isOverdue: boolean;
  }[] = [];

  const autosendingToday: string[] = [];

  for (const enrollment of activeEnrollments) {
    if (!enrollment.nextSendAt) continue;
    const nextSend = new Date(enrollment.nextSendAt);
    const isDueToday = nextSend <= todayEnd;
    const isOverdue = nextSend < todayStart;

    const steps = stepsBySeq.get(enrollment.sequenceId) ?? [];
    const currentStep = steps.find(s => s.stepOrder === enrollment.currentStep);
    if (!currentStep) continue;

    const seq = seqMap.get(enrollment.sequenceId);
    const seqName = seq?.name ?? "Unknown";

    if (currentStep.channel === "Task") {
      if (isDueToday) {
        tasksDue.push({
          enrollmentId: enrollment.id,
          contactName: enrollment.contactName,
          contactEmail: enrollment.contactEmail,
          company: enrollment.company,
          sequenceName: seqName,
          totalSteps: steps.length,
          currentStep: enrollment.currentStep,
          taskTitle: currentStep.taskTitle || `Step ${enrollment.currentStep} task`,
          taskDescription: currentStep.taskDescription,
          taskType: currentStep.taskType,
          nextSendAt: enrollment.nextSendAt,
          isOverdue,
        });
      }
    } else if (currentStep.channel === "Email") {
      if (isDueToday) {
        autosendingToday.push(enrollment.id);
      }
    }
  }

  // Sort tasks: overdue first, then by time
  tasksDue.sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    return a.nextSendAt.localeCompare(b.nextSendAt);
  });

  // This week preview (next 7 days)
  const thisWeek: { date: string; label: string; taskCount: number; emailCount: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(todayStart);
    d.setDate(d.getDate() + i);
    const dEnd = new Date(d);
    dEnd.setHours(23, 59, 59, 999);
    const dateStr = d.toISOString().split("T")[0];
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow"
      : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

    let taskCount = 0;
    let emailCount = 0;
    for (const enrollment of activeEnrollments) {
      if (!enrollment.nextSendAt) continue;
      const ns = new Date(enrollment.nextSendAt);
      if (ns >= d && ns <= dEnd) {
        const steps = stepsBySeq.get(enrollment.sequenceId) ?? [];
        const step = steps.find(s => s.stepOrder === enrollment.currentStep);
        if (step?.channel === "Task") taskCount++;
        else if (step?.channel === "Email") emailCount++;
      }
    }
    thisWeek.push({ date: dateStr, label, taskCount, emailCount });
  }

  return NextResponse.json({
    repliesWaiting,
    tasksDue,
    autosendingTodayCount: autosendingToday.length,
    overdueCount: tasksDue.filter(t => t.isOverdue).length,
    thisWeek,
  });
}
