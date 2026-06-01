import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ALLOWED_ROLES = ["TTTManager", "TTTAdmin", "TTTSales"] as const;

// ─── System Prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an AI staff assignment advisor for Top Tier Transitions, a luxury senior move management company. Your job is to recommend the ideal crew for an upcoming project based on a rich set of inputs.

You will receive:
- Project details: address(es), date, team composition needed, required skills, notes
- Staff roster with: name, role (Staff/Team Lead), skills, weekly hour goals, hours already scheduled this week, availability status

Your output must be structured in this exact format:

## Recommended Team

List the recommended team members in order: Team Leads first, then Staff. For each person:
- **[Name]** — [Role] — [availability/hours note]
  - Why selected: [1-2 sentences on fit — skills match, availability, hours pacing]

## Recommendation Summary
2-3 sentences explaining the overall logic of this recommendation.

## Flags and Considerations

List each flag as a bullet. Flags must include:
- Anyone NOT selected who is meaningfully underutilized
- Any selected person who is a trade-off
- Anyone approaching their max weekly hours if selected
- Any skill gaps if no fully qualified staff are available

## Alternative Options
If there are reasonable alternatives, list them briefly (1-3 bullets max).

Rules:
- Always hit the exact Team Lead count and Staff count requested
- Prioritize: (1) availability, (2) required skills match, (3) spreading hours toward target weekly goals
- Use first names + last initial for privacy (e.g., "Jordan M.")
- Be concise but specific
- If inputs are ambiguous, make a reasonable assumption and note it in the summary`;

// ─── Types ────────────────────────────────────────────────────────────────────
interface StaffForMapping {
  id: string;
  displayName: string;
  role: string;
  skills: string[];
  minWeeklyHours?: number;
  targetWeeklyHours?: number;
  maxWeeklyHours?: number;
  scheduledHoursThisWeek: number;
}

interface StructuredInput {
  originAddress: string;
  destinationAddress?: string;
  projectDate: string;
  teamLeadsNeeded: number;
  staffNeeded: number;
  requiredSkills: string[];
  maxDriveMiles?: number;
  notes?: string;
}

interface RequestBody {
  mode: "structured" | "freetext" | "voice";
  structuredInput?: StructuredInput;
  freetextInput?: string;
  members?: StaffForMapping[];
}

// ─── Build staff context string ───────────────────────────────────────────────
function buildStaffContext(members: StaffForMapping[]): string {
  if (!members || members.length === 0) return "No staff data provided.";

  const lines = members.map(m => {
    const name = m.displayName;
    const role = m.role ?? "Staff";
    const skills = m.skills?.length ? m.skills.join(", ") : "none";
    const hours = [
      m.minWeeklyHours != null ? `min ${m.minWeeklyHours}h` : null,
      m.targetWeeklyHours != null ? `target ${m.targetWeeklyHours}h` : null,
      m.maxWeeklyHours != null ? `max ${m.maxWeeklyHours}h` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const scheduled = m.scheduledHoursThisWeek ?? 0;
    return `- ${name} | Role: ${role} | Skills: ${skills} | Weekly hours (${hours || "unset"}) | Scheduled this week: ${scheduled}h`;
  });

  return `Staff Roster:\n${lines.join("\n")}`;
}

// ─── Build project description ────────────────────────────────────────────────
function buildProjectDescription(body: RequestBody): string {
  if (body.mode === "freetext" || body.mode === "voice") {
    return body.freetextInput ?? "(no input provided)";
  }

  const s = body.structuredInput;
  if (!s) return "(no input provided)";

  const parts: string[] = [];
  parts.push(`Origin: ${s.originAddress}`);
  if (s.destinationAddress) parts.push(`Destination: ${s.destinationAddress}`);
  if (s.projectDate) parts.push(`Date: ${s.projectDate}`);
  parts.push(`Team needed: ${s.teamLeadsNeeded} Team Lead(s), ${s.staffNeeded} Staff`);
  if (s.requiredSkills?.length) {
    parts.push(`Required skills: ${s.requiredSkills.join(", ")}`);
  }
  if (s.maxDriveMiles) parts.push(`Max drive distance: ${s.maxDriveMiles} miles`);
  if (s.notes) parts.push(`Notes: ${s.notes}`);

  return `Project Details:\n${parts.join("\n")}`;
}

// ─── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!role || !(ALLOWED_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.mode) {
    return NextResponse.json({ error: "mode is required" }, { status: 400 });
  }

  const projectDescription = buildProjectDescription(body);
  const staffContext = buildStaffContext(body.members ?? []);

  const userMessage = `${projectDescription}\n\n${staffContext}`;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        });

        for await (const chunk of response) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(new TextEncoder().encode(chunk.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        const errorMsg = `\n\nError generating recommendation: ${String(err)}`;
        controller.enqueue(new TextEncoder().encode(errorMsg));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
    },
  });
}
