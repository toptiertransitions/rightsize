// Email Me: Internal Team Brief. Pure: context in, { subject, html, text } out.
import { ph, renderEmail, val, type Part, type Section } from "./render";
import { fmtDate, fmtDay, type PlanEmailContext, type Shift } from "./context";
import { personParts } from "./mover-quote";

function teamParts(s: Shift | undefined, placeholder: string): Part {
  return s && s.team.length ? s.team.join(", ") : ph(placeholder);
}

function hours(s: Shift | undefined): Part {
  return s?.start ? `${s.start}${s.end ? ` to ${s.end}` : ""}` : ph("Hours");
}

export function unsoldPlacement(ctx: PlanEmailContext): Part {
  return ctx.unsoldPreference === "Return" ? "stay with the family" : ph("garage / designated area");
}

export function hasUnsoldPlan(ctx: PlanEmailContext): boolean {
  return !!(ctx.donation || ctx.junk || ctx.unsoldPreference);
}

export function buildTeamBriefEmail(ctx: PlanEmailContext) {
  const packDay = fmtDay(ctx.packing?.date);
  const moveDay = fmtDay(ctx.moveDate);
  const destName = ctx.dest.communityName || ctx.dest.address;
  const leadName = ctx.teamLead?.name;
  const moveOut = ctx.moveDayShifts.find((s) => s.activity === "Managing Moving Day");
  const moveIn = ctx.moveDayShifts.filter((s) => s.activity !== "Managing Moving Day");
  const moveInTeam = [...new Set(moveIn.flatMap((s) => s.team))];
  const moveInStart = moveIn.find((s) => s.start)?.start;

  const sections: Section[] = [
    {
      label: "Client & Project Details",
      blocks: [{
        kind: "rows",
        rows: [
          { icon: "🏠", label: "Origin", value: [val(ctx.origin.address, "Origin address"), ", ", ph("home type"), ...(ctx.origin.accessNotes ? [". ", ctx.origin.accessNotes] : [])] },
          { icon: "📍", label: "Destination", value: [val(ctx.dest.communityName, "Destination name"), ", ", val(ctx.dest.address, "address, unit #"), ", ", ph("access notes")] },
          { icon: "🚚", label: "Movers", value: ctx.movers ? [ctx.movers.company, ", ", val(ctx.movers.name, "contact"), ", ", val(ctx.movers.phone, "phone")] : ph("Company, contact, phone") },
          { icon: "⭐", label: "Team lead", value: [...personParts(ctx.teamLead, "Name, phone", { phone: true }), ". All client questions go through them first."] },
          { icon: "👥", label: "Client contacts", value: ctx.clientContacts.length ? ctx.clientContacts.map((c) => `${c.name}${c.relationship ? ` (${c.relationship})` : ""}`).join(", ") : ph("Names and relationships") },
        ],
      }],
    },
    {
      label: "Final Packing Day",
      blocks: [
        {
          kind: "rows",
          rows: [
            { icon: "📅", label: "Date", value: val(fmtDate(ctx.packing?.date), "Packing day") },
            { icon: "👥", label: "Team onsite", value: teamParts(ctx.packing, "Team names") },
            { icon: "⏰", label: "Hours", value: hours(ctx.packing) },
          ],
        },
        { kind: "para", parts: [{ b: `Before leaving ${packDay ?? "packing day"}:` }] },
        {
          kind: "list",
          checklist: true,
          items: [
            "Use blue painter's tape to label where every piece of furniture goes in the new space. This is critical for directing movers.",
            "Confirm we have the floor plan. If not, discuss with Jordan or your team lead.",
            "Photograph how spaces are currently set up (dressers, cabinets, desks, nightstands) so we can recreate the layout.",
          ],
        },
      ],
    },
    {
      label: "Move Day",
      blocks: [{
        kind: "rows",
        rows: [
          { icon: "📅", label: "Date", value: val(fmtDate(ctx.moveDate), "Move day") },
          { icon: "🚚", label: "Movers arrive", value: ph("Arrival window") },
          { icon: "🔑", label: "Move-out lead", value: [val(leadName, "Name"), ", arriving ", val(moveOut?.start, "time"), ". Greet the crew, walk them through, and oversee loading."] },
          { icon: "📦", label: "Last-minute packing", value: "Sheets, towels, fridge and food, cords, and anything left out overnight." },
          { icon: "🏡", label: "Move-in", value: [moveInTeam.length ? moveInTeam.join(", ") : ph("Names"), " at ", val(moveInStart, "time"), ". Direct placement using the tape labels and floor plan."] },
          { icon: "🧺", label: "Unpacking", value: "Full team, in the designated areas." },
          { icon: "✅", label: "EOD goal", value: ["All gray bins cleared and the client's home fully set up by ", val(ctx.moveDayEnd, "time"), "."] },
        ],
      }],
    },
    {
      label: `${ctx.dest.communityName || "Destination"} Move-In Rules`,
      blocks: [{
        kind: "rows",
        rows: [
          { icon: "👤", label: "Community contact", value: ctx.community ? personParts({ ...ctx.community, name: ctx.community.name || ctx.community.company }, "Community contact") : ph("Community contact") },
          { icon: "🛗", label: "Entrance & elevator", value: ph("Entrance & elevator") },
          { icon: "🅿️", label: "Parking", value: ph("Parking") },
          { icon: "🗑️", label: "Trash & boxes", value: ph("Trash & boxes") },
          { icon: "📋", label: "Other rules", value: ph("Other rules") },
        ],
      }],
    },
  ];

  if (hasUnsoldPlan(ctx)) {
    sections.push({
      label: "Unsold Furniture & Donations",
      blocks: [{
        kind: "list",
        items: [
          ["Direct movers to place unsold furniture in ", unsoldPlacement(ctx), " last."],
          ["Donation partner: ", val(ctx.donation?.names, "Donation partner"), ", ", val(fmtDate(ctx.donation?.date), "date/time"), "."],
          ["Junk removal partner ", val(ctx.junk?.names, "Junk removal partner"), " handles the rest."],
        ],
      }],
    });
  }

  sections.push(
    {
      label: "Client-Moved Items",
      blocks: [{
        kind: "callout",
        tone: "amber",
        title: "⚠️ We do not transport personal documents, jewelry, or prescription medications.",
        parts: ["If you spot any left out, flag them to ", val(leadName, "Team lead"), " so the family can collect them. Do NOT pack them."],
      }],
    },
    {
      label: "A Few Reminders",
      blocks: [{
        kind: "rows",
        rows: [
          { icon: "💬", label: "Client questions", value: "Vet them through the team lead first." },
          { icon: "🗂️", label: "Group your questions", value: "Bring the client over once, not for every question." },
          { icon: "📱", label: "Rightsize", value: "Clock in and out, and log items sold, donated, or set aside." },
          { icon: "🛒", label: "Supplies", value: ["Black dollies and TTT supplies must come to ", val(destName, "Destination"), ". RJ needs them for bin pickup on ", ph("Day/Time"), "."] },
          { icon: "👟", label: "What to wear/bring", value: "Comfortable shoes, water, movable but professional clothing, and a snack or lunch if working the full day." },
        ],
      }],
    },
  );

  const subtitle: Part[] = [val(fmtDate(ctx.packing?.date), "Day, Date"), " Final Packing · ", val(fmtDate(ctx.moveDate), "Day, Date"), " Move Day"];

  return renderEmail({
    subject: `Team Brief: ${ctx.clientName} | ${packDay ?? "[Day]"} Packing + ${moveDay ?? "[Day]"} Move Day. Please Read & Confirm`,
    kicker: "Top Tier Transitions · Internal Team Brief",
    title: ctx.clientName,
    subtitle,
    greeting: [
      "Hi team,",
      ["Here's the full run-of-show for the ", { b: ctx.clientName }, " project: final packing on ", val(packDay, "Day"), " and move day on ", val(moveDay, "Day"), ". Please read through carefully and reply to confirm receipt."],
    ],
    sections,
    closing: [["Thank you all. Let's give ", val(ctx.clientFirstNames ?? ctx.clientName, "Client"), " a smooth, stress-free move. Please reply to confirm you've received this brief."]],
    sender: ctx.sender,
    logoUrl: ctx.logoUrl,
    footer: "Top Tier Transitions · Internal Operations · Confidential",
  });
}
