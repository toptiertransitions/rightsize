// One-time: give every existing marketplace partner login a PartnerUsers row,
// so Admin > Marketplace > Users shows them before they next sign in.
//  - Partner whose CRM contact (crmReferralContactId) has a login -> Active Primary
//  - Partner that was invited but hasn't signed up yet            -> Invited Primary
// Skips any partner that already has rows. Dry run unless --apply.
// Usage: set -a; source .env.local; set +a; node scripts/backfill-partner-users.mjs [--apply]
const apply = process.argv.includes("--apply");
const B = process.env.AIRTABLE_BASE_ID, T = process.env.AIRTABLE_API_TOKEN;
const H = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };
const PARTNERS = process.env.AIRTABLE_MARKETPLACE_PARTNERS_TABLE || "Partners";
const USERS = process.env.AIRTABLE_PARTNER_USERS_TABLE || "PartnerUsers";
const CONTACTS = process.env.AIRTABLE_CRM_CONTACTS_TABLE;

async function all(table) {
  const out = []; let offset;
  do {
    const r = await fetch(`https://api.airtable.com/v0/${B}/${encodeURIComponent(table)}${offset ? `?offset=${offset}` : ""}`, { headers: H });
    const d = await r.json(); if (!r.ok) throw new Error(JSON.stringify(d));
    out.push(...d.records); offset = d.offset;
  } while (offset);
  return out;
}

const [partners, users, contacts] = await Promise.all([all(PARTNERS), all(USERS), all(CONTACTS)]);
const hasRows = new Set(users.map((u) => u.fields.PartnerId));
const contactById = new Map(contacts.map((c) => [c.id, c.fields]));
const contactByEmail = new Map(contacts.filter((c) => c.fields.Email).map((c) => [String(c.fields.Email).toLowerCase(), c.fields]));
const now = new Date().toISOString();
const rows = [];
for (const p of partners) {
  const f = p.fields;
  if (hasRows.has(p.id) || f.LifecycleStatus === "Archived") continue;
  const linkId = Array.isArray(f.CrmReferralContactId) ? f.CrmReferralContactId[0] : f.CrmReferralContactId;
  const email = String(f.Email || "").trim().toLowerCase();
  const contact = (linkId && contactById.get(linkId)) || (email && contactByEmail.get(email)) || null;
  const loginEmail = String(contact?.Email || email).trim().toLowerCase();
  if (!loginEmail) continue;
  if (contact?.ClerkUserId) {
    rows.push({ PartnerId: p.id, Email: loginEmail, ClerkUserId: contact.ClerkUserId, Name: contact.Name || f.POCName || "", Phone: contact.Phone || "", Role: "Primary", Status: "Active", AcceptedAt: now, NotifyLeads: true, Source: "Backfill", CreatedAt: now, _company: f.CompanyName });
  } else if (f.LifecycleStatus === "Invited") {
    rows.push({ PartnerId: p.id, Email: loginEmail, Name: contact?.Name || f.POCName || "", Role: "Primary", Status: "Invited", InvitedAt: now, NotifyLeads: true, Source: "Backfill", CreatedAt: now, _company: f.CompanyName });
  }
}
for (const r of rows) console.log(`${r.Status.padEnd(8)} ${r._company} <${r.Email}>`);
console.log(`${rows.length} rows ${apply ? "to create" : "(dry run)"}`);
if (apply) {
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10).map(({ _company, ...fields }) => ({ fields }));
    const r = await fetch(`https://api.airtable.com/v0/${B}/${encodeURIComponent(USERS)}`, { method: "POST", headers: H, body: JSON.stringify({ records: batch, typecast: true }) });
    if (!r.ok) throw new Error(await r.text());
  }
  console.log("done");
}
