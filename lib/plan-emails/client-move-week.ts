// Email Me: Client Move Week Details. Pure: context in, { subject, html, text } out.
import { ph, renderEmail, val, type Part, type Section } from "./render";
import { fmtDate, fmtDay, type PlanEmailContext } from "./context";
import { hasUnsoldPlan } from "./team-brief";

export function buildClientMoveWeekEmail(ctx: PlanEmailContext) {
  const packDay = fmtDay(ctx.packing?.date);
  const moveDay = fmtDay(ctx.moveDate);
  const destName = ctx.dest.communityName || ctx.dest.address;
  const unpack = ctx.moveDayShifts.filter((s) => s.activity !== "Managing Moving Day");
  const unpackStart = unpack.find((s) => s.start)?.start;
  const moveCompany = ctx.movers?.company;

  const sections: Section[] = [];

  if (ctx.packing) {
    sections.push({
      label: "Final Packing Day",
      blocks: [
        {
          kind: "rows",
          rows: [
            { icon: "📅", label: "Date", value: val(fmtDate(ctx.packing.date), "Packing day") },
            { icon: "📍", label: "Location", value: val(ctx.origin.address, "Location") },
            { icon: "👥", label: "Team onsite", value: ctx.packing.team.length ? ctx.packing.team.join(", ") : ph("Team names") },
            { icon: "⏰", label: "Hours", value: [ctx.packing.start ? `${ctx.packing.start}${ctx.packing.end ? ` to ${ctx.packing.end}` : ""}` : ph("Hours"), " (or until everything is packed and ready)"] },
          ],
        },
        { kind: "para", parts: "Our team will finish all remaining packing. We'll also use blue painter's tape to label where every piece of furniture will go in your new home. This keeps move day smooth and efficient, so you won't have to direct a thing." },
      ],
    });
  }

  sections.push(
    {
      label: "Move Day",
      blocks: [{
        kind: "rows",
        rows: [
          { icon: "📅", label: "Date", value: val(fmtDate(ctx.moveDate), "Move day") },
          { icon: "🚚", label: "Movers arrive", value: [ph("Arrival window"), ", ", val(moveCompany, "Moving company"), ", ", ph("#"), "-person crew"] },
          { icon: "⭐", label: "Your move day lead", value: [val(ctx.teamLead?.name, "Name"), " will be onsite to greet the crew, walk them through the home, and oversee loading."] },
          { icon: "🏠", label: "From", value: val(ctx.origin.address, "Origin address") },
          { icon: "📍", label: "To", value: [...(ctx.dest.communityName ? [ctx.dest.communityName, ", "] : []), val(ctx.dest.address, "Destination address")] },
          ...(ctx.origin.accessNotes ? [{ icon: "🔑", label: "Access notes", value: ctx.origin.accessNotes }] : []),
          { icon: "📦", label: "Last-minute packing", value: "Our team will handle the final items like bedding, towels, the fridge, and TV cords. If you have coolers, we're happy to use them!" },
          { icon: "🧺", label: "Unpacking", value: ["Onsite ", val(unpackStart, "start"), " to ", val(ctx.moveDayEnd, "end"), " to unpack and put everything away."] },
          { icon: "🎉", label: "Estimated wrap-up", value: ["Around ", val(ctx.moveDayEnd, "Time"), ". Everything unpacked, your bed made, and your new home ready to enjoy!"] },
        ],
      }],
    },
    {
      label: "A Few Things We'll Need From You",
      blocks: [{
        kind: "list",
        items: [
          ["The floor plan for ", val(destName, "Destination"), ", if you haven't sent it already."],
          [ph("Any other item")],
        ],
      }],
    },
    {
      label: "An Important Reminder",
      blocks: [{
        kind: "callout",
        tone: "amber",
        parts: "Our team is not able to transport personal documents, jewelry, or prescription medications. Please make sure these are packed and moved by you or a family member directly, and ensure these are NOT placed on the moving truck either.",
      }],
    },
    {
      label: "Our Recommendation for Move Day",
      blocks: [{
        kind: "callout",
        parts: ["Once the movers are loaded and headed to ", val(destName, "Destination"), ", we encourage you to step out. Grab lunch, run an errand, or take a breather. Move days can feel chaotic, and boxes will be everywhere while we work, so we'd love to take that off your plate. Our team will be there meeting the movers, placing furniture, and getting the unpack underway. We'd suggest checking back in around ", ph("Time"), ", once you can see your new home taking shape."],
      }],
    },
  );

  if (hasUnsoldPlan(ctx)) {
    const placement: Part = ctx.unsoldPreference === "Return" ? "come back to you" : ph("stay in the garage / go to our shop / be loaded last");
    sections.push({
      label: "Unsold Furniture & Donations",
      blocks: [{
        kind: "para",
        parts: ["Any furniture that hasn't sold will ", placement, ". We have ", val(ctx.donation?.names, "Donation partner(s)"), " scheduled for ", val(fmtDate(ctx.donation?.date), "Date"), " to pick up remaining items, and anything left after that can be handled by ", val(ctx.junk?.names, "Junk removal partner"), "."],
      }],
    });
  }

  if (ctx.afterMove.length) {
    sections.push({
      label: "After Move Day",
      blocks: ctx.afterMove.map((a) => ({
        kind: "para" as const,
        parts: [`Separately, we're coordinating ${a.name} for ${fmtDate(a.date)}. There's nothing you need to do for that piece, and we'll keep you posted.`],
      })),
    });
  }

  sections.push({
    label: "A Note on Tipping the Movers",
    blocks: [{
      kind: "para",
      parts: ["Tipping the ", val(moveCompany, "Moving company"), " crew is customary and always appreciated. The standard is 5-10% of the total move cost, paid directly to the crew on move day. It's completely optional, but we want to make sure you're prepared!"],
    }],
  });

  return renderEmail({
    subject: `${ctx.clientName}: Your Final Packing & Move Day Details`,
    kicker: "Top Tier Transitions · Move Week Details",
    title: ctx.clientName,
    subtitle: [
      ...(ctx.packing ? [fmtDate(ctx.packing.date)!, " Final Packing · "] : []),
      val(fmtDate(ctx.moveDate), "Day, Date"), " Move Day",
    ],
    greeting: [
      ["Hi ", val(ctx.clientFirstNames, "Client first names"), "!"],
      ["You are almost there, we are so excited to support you through these next few days! Here is everything you need to know heading into ", ...(ctx.packing ? [packDay!, " and "] : []), val(moveDay, "Move Day"), "."],
    ],
    sections,
    closing: [
      ["We are so honored to be part of this next chapter for your family. Please don't hesitate to reach out with anything between now and ", val(moveDay, "Move Day"), ". We are here every step of the way!"],
      "Warm regards,",
    ],
    sender: ctx.sender,
    logoUrl: ctx.logoUrl,
  });
}
