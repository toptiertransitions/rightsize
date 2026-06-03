import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getStaffMembers, getPlanEntriesForDateRange } from "@/lib/airtable";
import Anthropic from "@anthropic-ai/sdk";
import type { StaffMember, PlanEntry, WeeklySchedule } from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ALLOWED_ROLES = ["TTTManager", "TTTAdmin", "TTTSales"] as const;

const AT_BASE = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}`;
const AT_HEADERS = {
  Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN!}`,
  "Content-Type": "application/json",
};
const STAFF_ROLES_TABLE = process.env.STAFF_ROLES_TABLE_ID || "StaffRoles";
const SKILLS_TABLE = "Skills";

// ─── System Prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an AI staff assignment advisor for Top Tier Transitions, a luxury senior move management company. Your job is to recommend the ideal crew for an upcoming project based on a rich set of inputs.

You will receive:
- Project details: address(es), date, team composition needed, required skills, notes
- Staff roster with: name, role (Staff/Team Lead), skills, weekly hour goals, estimated scheduled hours this week, home address, and — critically — their availability status for the project date

Each staff member's entry includes an AVAILABILITY line:
- "Available (Mon 9:00–17:00)" or similar means they are scheduled to work and have no conflicts
- "UNAVAILABLE — time off" means they have marked this date as time off: do NOT select them unless you flag it as a major exception
- "UNAVAILABLE — not in schedule (Sat)" means Saturday is not a working day for them: do not select unless flagged
- "CONFLICT — already scheduled on this date (N shift(s))" means they are already assigned to another project: flag this if selecting them
- "No schedule set — assumed available" means no availability data exists

Your output must be structured in this exact format:

## Recommended Team

List the recommended team members in order: Team Leads first, then Staff. For each person:
- **[Name]** — [Role] — [availability note]
  - Why selected: [1-2 sentences on fit — skills match, availability, hours pacing, proximity]

## Recommendation Summary
2-3 sentences explaining the overall logic of this recommendation.

## Flags and Considerations

List each flag as a bullet. Flags must include:
- Anyone NOT selected who is meaningfully underutilized
- Any selected person who is a trade-off (conflict, at max hours, etc.)
- Anyone approaching their max weekly hours if selected
- Any skill gaps if no fully qualified staff are available
- If max drive distance is set, note anyone outside that radius

## Alternative Options
If there are reasonable alternatives, list them briefly (1-3 bullets max).

Rules:
- Always hit the exact Team Lead count and Staff count requested
- Prioritize: (1) available on the project date (no time off, no day-off schedule conflict), (2) no existing calendar conflict, (3) required skills match, (4) spreading hours toward target weekly goals, (5) proximity to project address
- Use first names + last initial for privacy (e.g., "Jordan M.")
- Be concise but specific
- If inputs are ambiguous, make a reasonable assumption and note it in the summary`;

// ─── Types ────────────────────────────────────────────────────────────────────
interface ScheduleEntry {
  date: string;
  activity: string;
  notes?: string;
  address?: string;
  startTime?: string;
  endTime?: string;
}

interface ProjectSchedule {
  projectName?: string;
  keyDates?: ScheduleEntry[];
  focusShifts?: ScheduleEntry[];
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
  projectSchedule?: ProjectSchedule;
}

interface RequestBody {
  mode: "structured" | "freetext" | "voice";
  structuredInput?: StructuredInput;
  freetextInput?: string;
  // members is still accepted but ignored — backend fetches authoritative data
  members?: unknown[];
}

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

// ─── Airtable helpers ─────────────────────────────────────────────────────────

interface StaffGoalRow {
  id: string;
  displayName: string;
  email: string;
  roleType: "Staff" | "Team Lead";
  minWeeklyHours?: number;
  targetWeeklyHours?: number;
  maxWeeklyHours?: number;
  skillIds: string[];
}

async function fetchStaffGoals(): Promise<StaffGoalRow[]> {
  const formula = encodeURIComponent(
    `AND({IsActive}=TRUE(),OR({Role}="TTTStaff",{Role}="TTTManager"))`
  );
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const qs =
      `?filterByFormula=${formula}&sort[0][field]=DisplayName&sort[0][direction]=asc` +
      (offset ? `&offset=${offset}` : "");
    const res = await fetch(`${AT_BASE}/${STAFF_ROLES_TABLE}${qs}`, {
      headers: AT_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) break;
    const data = await res.json();
    records.push(...(data.records as AirtableRecord[]));
    offset = data.offset;
  } while (offset);

  return records.map(r => {
    const f = r.fields;
    const skillIds = Array.isArray(f["Skills"])
      ? (f["Skills"] as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    return {
      id: r.id,
      displayName: typeof f["DisplayName"] === "string" ? f["DisplayName"] : "",
      email: typeof f["Email"] === "string" ? f["Email"] : "",
      roleType: f["RoleType"] === "Team Lead" ? "Team Lead" : "Staff",
      minWeeklyHours: typeof f["MinWeeklyHours"] === "number" ? f["MinWeeklyHours"] : undefined,
      targetWeeklyHours: typeof f["TargetWeeklyHours"] === "number" ? f["TargetWeeklyHours"] : undefined,
      maxWeeklyHours: typeof f["MaxWeeklyHours"] === "number" ? f["MaxWeeklyHours"] : undefined,
      skillIds,
    };
  });
}

async function fetchSkillNames(): Promise<Map<string, string>> {
  const res = await fetch(
    `${AT_BASE}/${encodeURIComponent(SKILLS_TABLE)}?sort[0][field]=SkillName`,
    { headers: AT_HEADERS, cache: "no-store" }
  );
  const map = new Map<string, string>();
  if (!res.ok) return map;
  const data = await res.json();
  for (const r of data.records as AirtableRecord[]) {
    if (typeof r.fields["SkillName"] === "string") {
      map.set(r.id, r.fields["SkillName"] as string);
    }
  }
  return map;
}

// ─── Availability helpers ─────────────────────────────────────────────────────

const DOW_KEYS: (keyof WeeklySchedule)[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function availabilityNote(member: StaffMember, dateStr: string): string {
  if (!dateStr) return "No date specified — availability unknown";

  // Time-off check
  const isTimeOff = (member.timeOff ?? []).some(t => t.date === dateStr);
  if (isTimeOff) return "UNAVAILABLE — time off";

  // Weekly schedule check
  const d = new Date(`${dateStr}T12:00:00Z`);
  const dayKey = DOW_KEYS[d.getUTCDay()];
  const schedule = member.weeklySchedule?.[dayKey];
  if (schedule) {
    if (!schedule.available) return `UNAVAILABLE — not in schedule (${dayKey})`;
    return `Available (${dayKey} ${schedule.start}–${schedule.end})`;
  }

  return "No schedule set — assumed available";
}

function getWeekRange(dateStr: string): { weekStart: string; weekEnd: string } {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const dow = d.getUTCDay();
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
  return { weekStart: fmt(monday), weekEnd: fmt(sunday) };
}

/** Rough scheduled hours: count shifts per person, assume 8h each */
function computeScheduledHours(
  entries: PlanEntry[],
  email: string
): number {
  const emailLower = email.toLowerCase();
  let shifts = 0;
  for (const e of entries) {
    if (e.entryType === "keydate") continue;
    if (e.helpers?.some(h => h.email.toLowerCase() === emailLower && h.status !== "declined")) {
      shifts++;
    }
  }
  return shifts * 8;
}

/** Returns count of non-keydate shifts on a specific date that include this person */
function conflictsOnDate(entries: PlanEntry[], email: string, date: string): number {
  const emailLower = email.toLowerCase();
  return entries.filter(
    e =>
      e.date === date &&
      e.entryType !== "keydate" &&
      e.helpers?.some(h => h.email.toLowerCase() === emailLower && h.status !== "declined")
  ).length;
}

// ─── Build staff context string ───────────────────────────────────────────────

interface EnrichedMember {
  displayName: string;
  email: string;
  roleType: "Staff" | "Team Lead";
  skills: string[];
  minWeeklyHours?: number;
  targetWeeklyHours?: number;
  maxWeeklyHours?: number;
  scheduledHoursThisWeek: number;
  address?: string;
  availabilityNote: string;
  calendarConflicts: number;
}

function buildStaffContext(members: EnrichedMember[]): string {
  if (members.length === 0) return "No staff data available.";

  const lines = members.map(m => {
    const [first, ...rest] = m.displayName.trim().split(/\s+/);
    const lastInitial = rest[0]?.[0] ?? "";
    const name = lastInitial ? `${first} ${lastInitial}.` : first;

    const skills = m.skills.length ? m.skills.join(", ") : "none listed";
    const hourParts = [
      m.minWeeklyHours != null ? `min ${m.minWeeklyHours}h` : null,
      m.targetWeeklyHours != null ? `target ${m.targetWeeklyHours}h` : null,
      m.maxWeeklyHours != null ? `max ${m.maxWeeklyHours}h` : null,
    ].filter(Boolean);
    const hoursGoal = hourParts.length ? hourParts.join(", ") : "no hour goals set";
    const remaining =
      m.targetWeeklyHours != null
        ? ` (${Math.max(0, m.targetWeeklyHours - m.scheduledHoursThisWeek)}h below target)`
        : "";

    const location = m.address
      ? extractCityState(m.address) || m.address
      : "address not on file";

    const conflictNote =
      m.calendarConflicts > 0
        ? `CONFLICT — already scheduled on this date (${m.calendarConflicts} shift${m.calendarConflicts !== 1 ? "s" : ""})`
        : m.availabilityNote;

    return [
      `- ${name} | Role: ${m.roleType} | Skills: ${skills}`,
      `  Weekly goals: ${hoursGoal} | Scheduled this week: ~${m.scheduledHoursThisWeek}h${remaining}`,
      `  Location: ${location}`,
      `  Availability: ${conflictNote}`,
    ].join("\n");
  });

  return `Staff Roster (${members.length} active members):\n${lines.join("\n")}`;
}

function extractCityState(address: string): string {
  const parts = address.split(",").map(s => s.trim());
  if (parts.length >= 3) return parts.slice(-3, -1).join(", ");
  if (parts.length === 2) return parts[0];
  return "";
}

// ─── Build project description ────────────────────────────────────────────────

function buildProjectDescription(body: RequestBody): string {
  if (body.mode === "freetext" || body.mode === "voice") {
    return body.freetextInput ?? "(no input provided)";
  }

  const s = body.structuredInput;
  if (!s) return "(no input provided)";

  const parts: string[] = [];
  if (s.projectSchedule?.projectName) parts.push(`Project: ${s.projectSchedule.projectName}`);
  parts.push(`Origin: ${s.originAddress}`);
  if (s.destinationAddress) parts.push(`Destination: ${s.destinationAddress}`);
  if (s.projectDate) parts.push(`Date: ${s.projectDate}`);
  parts.push(`Team needed: ${s.teamLeadsNeeded} Team Lead(s), ${s.staffNeeded} Staff`);
  if (s.requiredSkills?.length) parts.push(`Required skills: ${s.requiredSkills.join(", ")}`);
  if (s.maxDriveMiles) parts.push(`Max drive distance: ${s.maxDriveMiles} miles`);
  if (s.notes) parts.push(`Notes: ${s.notes}`);

  if (s.projectSchedule) {
    const { keyDates, focusShifts } = s.projectSchedule;
    if (keyDates?.length) {
      const lines = keyDates.map(d =>
        `  - ${d.date}: ${d.activity}${d.startTime ? ` (${d.startTime}${d.endTime ? `–${d.endTime}` : ""})` : ""}${d.notes ? ` — ${d.notes}` : ""}${d.address ? ` @ ${d.address}` : ""}`
      );
      parts.push(`Upcoming Key Dates:\n${lines.join("\n")}`);
    }
    if (focusShifts?.length) {
      const lines = focusShifts.map(d =>
        `  - ${d.date}: ${d.activity}${d.startTime ? ` (${d.startTime}${d.endTime ? `–${d.endTime}` : ""})` : ""}${d.notes ? ` — ${d.notes}` : ""}${d.address ? ` @ ${d.address}` : ""}`
      );
      parts.push(`Upcoming Focus Shifts:\n${lines.join("\n")}`);
    }
  }

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

  const projectDate = body.structuredInput?.projectDate || null;

  // ── Fetch all staff data in parallel ────────────────────────────────────────
  const weekRange = projectDate ? getWeekRange(projectDate) : null;

  const [staffMembers, staffGoals, skillNameMap, weeklyEntries] = await Promise.all([
    getStaffMembers().catch(() => [] as StaffMember[]),
    fetchStaffGoals().catch(() => [] as StaffGoalRow[]),
    fetchSkillNames().catch(() => new Map<string, string>()),
    weekRange
      ? getPlanEntriesForDateRange(weekRange.weekStart, weekRange.weekEnd).catch(() => [] as PlanEntry[])
      : Promise.resolve([] as PlanEntry[]),
  ]);

  // ── Build lookup maps ────────────────────────────────────────────────────────
  const staffMemberByEmail = new Map<string, StaffMember>(
    staffMembers.filter(s => s.isActive).map(s => [s.email.toLowerCase(), s])
  );

  // ── Merge into enriched members ──────────────────────────────────────────────
  // Use staffGoals as the primary roster (active TTTStaff + TTTManager)
  const enrichedMembers: EnrichedMember[] = staffGoals.map(g => {
    const emailKey = g.email.toLowerCase();
    const fullMember = staffMemberByEmail.get(emailKey);
    const skills = g.skillIds.map(id => skillNameMap.get(id)).filter((n): n is string => !!n);
    const availability = fullMember && projectDate
      ? availabilityNote(fullMember, projectDate)
      : "No availability data";
    const calendarConflicts = projectDate && fullMember
      ? conflictsOnDate(weeklyEntries, fullMember.email, projectDate)
      : 0;
    const scheduledHours = fullMember
      ? computeScheduledHours(weeklyEntries, fullMember.email)
      : 0;
    const displayName = fullMember?.displayName || g.displayName || "Unknown";

    return {
      displayName,
      email: g.email,
      roleType: g.roleType,
      skills,
      minWeeklyHours: g.minWeeklyHours,
      targetWeeklyHours: g.targetWeeklyHours,
      maxWeeklyHours: g.maxWeeklyHours,
      scheduledHoursThisWeek: scheduledHours,
      address: fullMember?.address,
      availabilityNote: availability,
      calendarConflicts,
    };
  });

  const projectDescription = buildProjectDescription(body);
  const staffContext = buildStaffContext(enrichedMembers);
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
