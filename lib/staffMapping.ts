// ─── Staff Mapping Context Builder ───────────────────────────────────────────
// Utility for building structured AI prompts from staff data.

export interface StaffMappingMember {
  id: string;
  displayName: string;
  role: string; // "Staff" | "Team Lead"
  skills: string[]; // skill names
  minWeeklyHours?: number;
  targetWeeklyHours?: number;
  maxWeeklyHours?: number;
  scheduledHoursThisWeek: number;
}

export interface StaffMappingContext {
  members: StaffMappingMember[];
  generatedAt: string;
}

export interface ProjectInput {
  mode: "structured" | "freetext" | "voice";
  originAddress?: string;
  destinationAddress?: string;
  projectDate?: string;
  teamLeadsNeeded?: number;
  staffNeeded?: number;
  requiredSkills?: string[];
  maxDriveMiles?: number;
  notes?: string;
  freetextDescription?: string;
}

/**
 * Builds a human-readable staff context string for use in AI prompts.
 * Lists each staff member's name, role, skills, weekly hour goals,
 * and hours already scheduled this week.
 */
export function buildStaffMappingContext(members: StaffMappingMember[]): string {
  if (!members || members.length === 0) {
    return "Staff Roster: (no staff data available)";
  }

  const lines = members.map(m => {
    const firstName = m.displayName.trim().split(/\s+/)[0] ?? m.displayName;
    const lastInitial = m.displayName.trim().split(/\s+/).slice(1)[0]?.[0] ?? "";
    const shortName = lastInitial ? `${firstName} ${lastInitial}.` : firstName;

    const role = m.role ?? "Staff";
    const skills =
      m.skills?.length > 0
        ? m.skills.join(", ")
        : "none listed";

    const hourParts: string[] = [];
    if (m.minWeeklyHours != null) hourParts.push(`min ${m.minWeeklyHours}h`);
    if (m.targetWeeklyHours != null) hourParts.push(`target ${m.targetWeeklyHours}h`);
    if (m.maxWeeklyHours != null) hourParts.push(`max ${m.maxWeeklyHours}h`);
    const hoursGoal = hourParts.length > 0 ? hourParts.join(", ") : "no hour goals set";

    const scheduled = m.scheduledHoursThisWeek ?? 0;
    const remaining =
      m.targetWeeklyHours != null
        ? ` (${Math.max(0, m.targetWeeklyHours - scheduled)}h below target)`
        : "";

    return (
      `- ${shortName} | Role: ${role} | Skills: ${skills} | ` +
      `Weekly goals: ${hoursGoal} | Scheduled this week: ${scheduled}h${remaining}`
    );
  });

  return `Staff Roster (${members.length} active members):\n${lines.join("\n")}`;
}

/**
 * Formats a structured project input into a readable description for the AI prompt.
 */
export function buildProjectDescription(input: ProjectInput): string {
  if (input.mode === "freetext" || input.mode === "voice") {
    return input.freetextDescription ?? "(no project description provided)";
  }

  const parts: string[] = [];

  if (input.originAddress) parts.push(`Origin Address: ${input.originAddress}`);
  if (input.destinationAddress) parts.push(`Destination Address: ${input.destinationAddress}`);
  if (input.projectDate) parts.push(`Project Date: ${input.projectDate}`);

  const teamLeads = input.teamLeadsNeeded ?? 0;
  const staff = input.staffNeeded ?? 0;
  parts.push(`Crew Needed: ${teamLeads} Team Lead(s), ${staff} Staff member(s)`);

  if (input.requiredSkills && input.requiredSkills.length > 0) {
    parts.push(`Required Skills: ${input.requiredSkills.join(", ")}`);
  }

  if (input.maxDriveMiles != null) {
    parts.push(`Max Drive Distance: ${input.maxDriveMiles} miles`);
  }

  if (input.notes) parts.push(`Additional Notes: ${input.notes}`);

  return `Project Details:\n${parts.join("\n")}`;
}
