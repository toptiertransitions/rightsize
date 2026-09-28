import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { getSystemRole } from "@/lib/airtable";
import { getQuarterlyPlanData, getQuarterCompanyPlans, type CompanyPlanDetail } from "@/lib/crm-plan";
import { buildQuarterlyPlanningReportEmail, type QPlanningCompanyRow, type QPlanningRepSection } from "@/lib/email";

const resend = new Resend(process.env.RESEND_API_KEY);

function fmtRange(startDate: string, endDate: string): string {
  const fmt = (d: string) => {
    if (!d) return "";
    const [y, m, day] = d.slice(0, 10).split("-");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[parseInt(m, 10) - 1]} ${parseInt(day, 10)}, ${y}`;
  };
  return `${fmt(startDate)} – ${fmt(endDate)}`;
}

function toRow(
  c: { companyId: string; companyName: string; priority: string; goal: number; actual: number; competitors?: string | null } & Partial<{
    bestStage: string; nextStepDate: string | null; nextStepNote: string | null; stageDurationDays: number | null;
  }>,
  planMap: Map<string, CompanyPlanDetail>
): QPlanningCompanyRow {
  const plan = planMap.get(c.companyId) ?? null;
  const hasPlanContent = plan && (
    plan.meeting1 || plan.meeting2 || plan.meeting3 ||
    plan.resource1 || plan.resource2 || plan.resource3 ||
    plan.monthlyMeetingGoal > 0 || plan.monthlyCheckinGoal > 0
  );
  return {
    companyName: c.companyName,
    priority: (c.priority as QPlanningCompanyRow["priority"]) ?? "",
    goal: c.goal,
    actual: c.actual,
    bestStage: c.bestStage,
    nextStepDate: c.nextStepDate,
    nextStepNote: c.nextStepNote,
    stageDurationDays: c.stageDurationDays,
    competitors: c.competitors ?? null,
    plan: hasPlanContent ? plan : null,
  };
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { quarterId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { quarterId } = body;
  if (!quarterId) return NextResponse.json({ error: "quarterId required" }, { status: 400 });

  const client = await clerkClient();
  const clerkUser = await client.users.getUser(userId);
  const userEmail = clerkUser.emailAddresses[0]?.emailAddress;
  if (!userEmail) return NextResponse.json({ error: "No email on account" }, { status: 400 });

  const [planData, companyPlans] = await Promise.all([
    getQuarterlyPlanData(quarterId),
    getQuarterCompanyPlans(quarterId).catch(() => new Map<string, CompanyPlanDetail>()),
  ]);
  if (!planData) return NextResponse.json({ error: "Quarter not found" }, { status: 404 });

  const reps: QPlanningRepSection[] = planData.reps.map((rep) => ({
    displayName: rep.displayName,
    goal: rep.goal,
    actual: rep.actual,
    activePartners: rep.activePartners.map((c) => toRow(c, companyPlans)),
    conversionTargets: rep.conversionTargets.map((c) => toRow(c, companyPlans)),
    availableToConvert: rep.availableToConvert.map((a) => ({
      companyName: a.companyName,
      priority: (a.priority as QPlanningCompanyRow["priority"]) ?? "",
      bestStage: a.bestStage,
    })),
  }));

  const generatedAt = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const html = buildQuarterlyPlanningReportEmail({
    quarterLabel: planData.quarter.label,
    quarterRange: fmtRange(planData.quarter.startDate, planData.quarter.endDate),
    reps,
    generatedAt,
  });

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "hello@toptiertransitions.com",
    to: userEmail,
    subject: `Q Planning Report — ${planData.quarter.label}`,
    html,
  });

  if (error) {
    console.error("[q-planning-email]", error);
    return NextResponse.json({ error: error.message || "Failed to send report" }, { status: 500 });
  }

  return NextResponse.json({ success: true, sentTo: userEmail });
}
