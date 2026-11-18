import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { getStaffEngagement } from "@/lib/staff-engagement/data";
import { RECENT_WEEKS, WEEKS, type StaffEngagement, type StaffSummary } from "@/lib/staff-engagement/score";

// Staff Goals > AI Summary: reads the same numbers as the Hours vs Target
// table (recomputed here, never taken from the browser) and writes Ops a
// short retention read: who is at high, middle and low risk of leaving,
// why, and what to do this week.
export const maxDuration = 120;

const SYSTEM_PROMPT = `You help the Operations leader of Top Tier Transitions, a senior move management company, keep their part-time field staff. Staff pick up shifts (packing, sorting, moving, estate sales) and log their hours in the Rightsize app. Each has a weekly target hours goal.

You read hard numbers and write a short, kind, practical retention read. Be accurate: only state what the data shows, never invent reasons, and quote real numbers. Low hours can mean two different things: we aren't offering them enough work (they're available and saying yes), or they're pulling away (declining, not answering, inactive in the app, cutting availability). Always say which, because the fix is different. Working past their max hours is a burnout risk. People in their first 90 days are likeliest to leave.`;

const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "staff"],
  properties: {
    overview: { type: "array", items: { type: "string" } },
    staff: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "tier", "why", "action"],
        properties: {
          name: { type: "string" },
          tier: { type: "string", enum: ["High", "Middle", "Low", "Dormant"] },
          why: { type: "string" },
          action: { type: "string" },
        },
      },
    },
  },
};

function line(s: StaffEngagement): string {
  const parts = [
    `${s.name} (${s.role === "TTTManager" ? "Manager" : s.role === "TTTTeamLead" ? "Team Lead" : "Staff"}${s.tenureDays != null ? `, ${s.tenureDays} days since hire` : ""})`,
    `target ${s.targetWeeklyHours ?? "not set"}${s.minWeeklyHours ? `, min ${s.minWeeklyHours}` : ""}${s.maxWeeklyHours ? `, max ${s.maxWeeklyHours}` : ""} hrs/wk`,
    `weekly hours oldest to newest: ${s.weeklyHours.join(", ")} (this week so far ${s.currentWeekHours})`,
    `last ${RECENT_WEEKS} wks avg ${s.recentAvg}, prior 8 wks avg ${s.priorAvg}`,
    `last hours logged ${s.daysSinceHours == null ? `none in ${WEEKS} wks` : `${s.daysSinceHours} days ago`}`,
    `available ${s.availableHours == null ? "not set" : `${s.availableHours} hrs/wk`}${s.timeOffDaysNext30 ? `, ${s.timeOffDaysNext30} days off next 30` : ""}`,
    `shift invites (${WEEKS} wks): ${s.invitesAccepted} accepted, ${s.invitesDeclined} declined, ${s.invitesUnanswered} never answered; ${s.invitesLast4Weeks} invites in the last 4 wks; ${s.upcomingShifts} accepted shifts next 14 days`,
    `last in app ${s.daysSinceActive == null ? "unknown" : `${s.daysSinceActive} days ago`}`,
    `rule-based score ${s.score} (${s.tier}, ${s.cause})${s.reasons.length ? `: ${s.reasons.join("; ")}` : ""}`,
  ];
  return `- ${parts.join(" | ")}`;
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId);
  if (role !== "TTTManager" && role !== "TTTAdmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const report = await getStaffEngagement();
    if (!report.staff.length) return NextResponse.json({ error: "No active staff to summarize" }, { status: 400 });

    const prompt = `Today is ${report.today}. Weeks run Monday to Sunday; the ${WEEKS} complete weeks start ${report.weekStarts[0]}.

STAFF (${report.staff.length}):
${report.staff.map(line).join("\n")}

Write the retention read for the Ops leader.
- overview: 3 or 4 bullets, each one sentence under 30 words: how the team is tracking against target hours overall (with counts), the biggest pattern (e.g. several people under-scheduled vs. pulling away, and how many are dormant), and the single most important thing to do this week.
- staff: every person above, exactly once, using their name exactly as written.
  - tier: High (real risk of leaving soon), Middle (early warning signs worth a nudge), Low (steady) or Dormant (no hours in 8+ weeks and nothing scheduled: likely already gone unless someone reaches out). Start from the rule-based tier (High = High, Watch = Middle, Low = Low, Dormant = Dormant). Keep Dormant as is. Otherwise move someone at most one tier, and only when the numbers clearly support it (for example a flagged person who is new but already ramping up, or a Low person whose hours just fell off a cliff).
  - why: one sentence under 25 words with the real numbers behind it; say whether it looks like under-scheduling, pulling away or overload.
  - action: one specific thing the Ops leader can do this week, under 20 words (offer specific extra shifts, a 1:1 check-in, revisit their target or availability, lighten the load, or a thank-you for steady people).`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: { effort: "medium", format: { type: "json_schema", schema: RESULT_SCHEMA as unknown as Record<string, unknown> } },
      messages: [{ role: "user", content: prompt }],
    });
    if (msg.stop_reason === "refusal") throw new Error("The model declined to summarize");
    const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
    const parsed = JSON.parse(text) as Omit<StaffSummary, "generatedAt">;

    // Keep only real staff, once each, in risk order
    const known = new Set(report.staff.map((s) => s.name));
    const seen = new Set<string>();
    const order = { High: 0, Middle: 1, Low: 2, Dormant: 3 } as const;
    const staff = (parsed.staff ?? [])
      .filter((s) => known.has(s.name) && !seen.has(s.name) && seen.add(s.name))
      .sort((a, b) => order[a.tier] - order[b.tier] || a.name.localeCompare(b.name));

    const summary: StaffSummary = { generatedAt: new Date().toISOString(), overview: (parsed.overview ?? []).slice(0, 4), staff };
    return NextResponse.json(summary);
  } catch (e) {
    console.error("[staff/engagement/summary]", e);
    return NextResponse.json({ error: "Couldn't write the AI summary. Try again." }, { status: 500 });
  }
}
