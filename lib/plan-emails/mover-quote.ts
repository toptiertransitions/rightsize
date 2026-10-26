// Email Me: Mover Quote Request. Pure: context in, { subject, html, text } out.
import { BRAND, esc, ph, renderEmail, val, type Part } from "./render";
import { fmtDate, type Person, type PlanEmailContext } from "./context";

export function personParts(p: Person | undefined, placeholder: string, opts: { phone?: boolean; email?: boolean } = { phone: true, email: true }): Part[] {
  if (!p) return [ph(placeholder)];
  const out: Part[] = [p.name];
  if (p.relationship) out.push(` (${p.relationship})`);
  if (opts.phone) out.push(", ", val(p.phone, "phone"));
  if (opts.email) out.push(", ", val(p.email, "email"));
  return out;
}

function cldThumb(url: string): string {
  return url.includes("res.cloudinary.com/") && url.includes("/upload/")
    ? url.replace("/upload/", "/upload/c_fill,w_96,h_96,q_auto,f_jpg/")
    : url;
}

function inventoryHtml(ctx: PlanEmailContext): string {
  if (ctx.inventory.length === 0) {
    return `<p style="margin:10px 0;font-size:14px;color:${BRAND.phInk};background:${BRAND.phBg};padding:8px 10px;border-radius:6px;">No catalog items are marked To Be Moved for this project yet.</p>`;
  }
  const th = (t: string, align = "left") => `<th align="${align}" style="padding:8px 6px;border-bottom:2px solid ${BRAND.line};font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${BRAND.muted};">${t}</th>`;
  const td = (t: string, align = "left") => `<td align="${align}" valign="middle" style="padding:6px;border-bottom:1px solid ${BRAND.line};font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${BRAND.ink};">${t}</td>`;
  // Only show the columns this project has data for
  const showPhoto = ctx.inventory.some((i) => i.photo);
  const showRoom = ctx.inventory.some((i) => i.room);
  const showDims = ctx.inventory.some((i) => i.dims);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:8px;">
<tr>${showPhoto ? th("") : ""}${th("Item")}${th("Qty", "center")}${showRoom ? th("Room") : ""}${showDims ? th("Dimensions") : ""}</tr>
${ctx.inventory
  .map(
    (i) => `<tr>${showPhoto ? td(i.photo ? `<img src="${esc(cldThumb(i.photo))}" width="48" height="48" alt="" style="display:block;width:48px;height:48px;border-radius:4px;border:0;object-fit:cover;">` : "&nbsp;") : ""}${td(esc(i.name))}${td(String(i.qty), "center")}${showRoom ? td(i.room ? esc(i.room) : "&nbsp;") : ""}${showDims ? td(i.dims ? esc(i.dims) : "&nbsp;") : ""}</tr>`,
  )
  .join("\n")}
</table>`;
}

function inventoryText(ctx: PlanEmailContext): string {
  if (ctx.inventory.length === 0) return "No catalog items are marked To Be Moved for this project yet.";
  return ctx.inventory.map((i) => `- ${i.name} (qty ${i.qty})${i.room ? `, ${i.room}` : ""}${i.dims ? `, ${i.dims}` : ""}`).join("\n");
}

export function buildMoverQuoteEmail(ctx: PlanEmailContext) {
  const residence = (typeLabel: string | undefined): Part[] => [val(typeLabel, "Home / Condo / Senior Living"), ", ", ph("Stairs / Elevator"), ", ", ph("floor #")];
  return renderEmail({
    subject: `Mover Quote Request: ${ctx.clientName}`,
    kicker: "Top Tier Transitions · Move Coordination",
    title: "Moving Quote Request",
    greeting: [
      ["Hi ", val(ctx.movers?.name, "Name"), ","],
      ["I hope you are doing well! I'm reaching out on behalf of one of our clients, ", { b: ctx.clientName }, ", who has an upcoming move. I'd love to get a quote from your team to share with them."],
    ],
    sections: [
      {
        label: "Move Details",
        blocks: [{
          kind: "rows",
          rows: [
            { icon: "📅", label: "Move date(s)", value: val(fmtDate(ctx.moveDate), "Move date") },
            { icon: "⏰", label: "Arrival window", value: ph("Arrival window") },
            { icon: "🏠", label: "Origin", value: val(ctx.origin.address, "Origin address") },
            { icon: "📍", label: "Destination", value: val(ctx.dest.address, "Destination address") },
            { icon: "➕", label: "Additional stop(s)", value: "N/A" },
          ],
        }],
      },
      {
        label: "Residence & Access",
        blocks: [{
          kind: "rows",
          rows: [
            { icon: "🏠", label: "Origin", value: residence(undefined) },
            { icon: "📍", label: "Destination", value: [...(ctx.dest.communityName ? [ctx.dest.communityName, ", "] : []), ...residence(ctx.dest.typeLabel)] },
            { icon: "📋", label: "Building requirements", value: "N/A" },
          ],
        }],
      },
      {
        label: "Scope of Services",
        blocks: [{
          kind: "rows",
          rows: [
            { icon: "📦", label: "Packing", value: "Top Tier Transitions will have everything packed. We will need furniture padded and wrapped and wardrobe boxes provided. Additional packing materials are not needed unless noted." },
            { icon: "⭐", label: "Special items", value: ctx.specialItems || "N/A" },
            { icon: "♻️", label: "Disposal / donation", value: ctx.disposalNotes || "N/A" },
          ],
        }],
      },
      {
        label: "Inventory",
        blocks: [
          { kind: "para", parts: "Please see the attached inventory from our catalog." },
          { kind: "raw", html: inventoryHtml(ctx), text: inventoryText(ctx) },
        ],
      },
      {
        label: "Could You Please Send Over",
        blocks: [{
          kind: "list",
          ordered: true,
          items: [
            "A written estimate with the recommended crew size and a clear breakdown of labor, travel/truck fees, materials, and any additional charges.",
            "Insurance/valuation coverage options.",
            "Confirmation of availability for the proposed date(s).",
          ],
        }],
      },
      {
        label: "Contacts",
        blocks: [{
          kind: "rows",
          rows: [
            { icon: "✉️", label: "Send estimate to", value: personParts(ctx.estimateTo, "TTT team member") },
            { icon: "👤", label: "Client contact", value: personParts(ctx.clientContacts[0], "Name, phone, email") },
            { icon: "📞", label: "Day-of contact (team lead)", value: personParts(ctx.teamLead, "TTT team member, cell", { phone: true }) },
          ],
        }],
      },
    ],
    closing: ["Let me know if you need any more details from me to put this together!", "Thank you,"],
    sender: ctx.sender,
    logoUrl: ctx.logoUrl,
  });
}
