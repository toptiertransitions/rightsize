/**
 * Rightsize MCP HTTP Endpoint
 *
 * Implements the Model Context Protocol over HTTP (Streamable HTTP transport).
 * Claude Code points to this URL — no local server, no API tokens needed per user.
 *
 * Auth: Bearer token in Authorization header matched against MCP_API_KEY env var.
 *       The token is baked into .mcp.json so team members need nothing extra.
 *
 * All Airtable access uses the app's existing AIRTABLE_API_TOKEN / AIRTABLE_BASE_ID.
 */

import { NextResponse } from "next/server";

// ── Auth ──────────────────────────────────────────────────────────────────────
const MCP_API_KEY = process.env.MCP_API_KEY ?? "";

function unauthorized() {
  return NextResponse.json(
    { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null },
    { status: 401 }
  );
}

// ── Airtable helpers (raw fetch — same pattern as lib/airtable.ts) ────────────
const AT_BASE = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}`;
const AT_HEADERS = () => ({
  "Authorization": `Bearer ${process.env.AIRTABLE_API_TOKEN}`,
  "Content-Type":  "application/json",
});

type Fields = Record<string, unknown>;
interface ARecord { id: string; fields: Fields; }

async function atFetchAll(table: string, params: Record<string, string> = {}): Promise<ARecord[]> {
  const all: ARecord[] = [];
  let offset: string | undefined;
  do {
    const sp = new URLSearchParams(params);
    if (offset) sp.set("offset", offset);
    const res = await fetch(`${AT_BASE}/${encodeURIComponent(table)}?${sp}`, { headers: AT_HEADERS() });
    if (!res.ok) throw new Error(`Airtable [${table}]: ${await res.text()}`);
    const json = await res.json() as { records: ARecord[]; offset?: string };
    all.push(...json.records);
    offset = json.offset;
  } while (offset);
  return all;
}

async function atCreate(table: string, fields: Fields): Promise<ARecord> {
  const res = await fetch(`${AT_BASE}/${encodeURIComponent(table)}`, {
    method: "POST", headers: AT_HEADERS(), body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Airtable create [${table}]: ${await res.text()}`);
  return res.json() as Promise<ARecord>;
}

async function atPatch(table: string, id: string, fields: Fields): Promise<void> {
  const res = await fetch(`${AT_BASE}/${encodeURIComponent(table)}/${id}`, {
    method: "PATCH", headers: AT_HEADERS(), body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Airtable patch [${table}/${id}]: ${await res.text()}`);
}

async function atDelete(table: string, id: string): Promise<void> {
  const res = await fetch(`${AT_BASE}/${encodeURIComponent(table)}/${id}`, {
    method: "DELETE", headers: AT_HEADERS(),
  });
  if (!res.ok) throw new Error(`Airtable delete [${table}/${id}]: ${await res.text()}`);
}

// ── Table names (respect app's env overrides) ─────────────────────────────────
const T = {
  TENANTS:             process.env.AIRTABLE_TENANTS_TABLE             ?? "Tenants",
  CRM_COMPANIES:       process.env.AIRTABLE_CRM_COMPANIES_TABLE       ?? "CRMReferralCompanies",
  CRM_CONTACTS:        process.env.AIRTABLE_CRM_CONTACTS_TABLE        ?? "CRMReferralContacts",
  CRM_CLIENT_CONTACTS: process.env.AIRTABLE_CRM_CLIENT_CONTACTS_TABLE ?? "CRMClientContacts",
  CRM_OPPORTUNITIES:   process.env.AIRTABLE_CRM_OPPORTUNITIES_TABLE   ?? "CRMOpportunities",
  CRM_ACTIVITIES:      process.env.AIRTABLE_CRM_ACTIVITIES_TABLE      ?? "CRMActivities",
};

// ── Utility helpers ───────────────────────────────────────────────────────────
const s  = (v: unknown): string => typeof v === "string" ? v : "";
const n  = (v: unknown): number => typeof v === "number" ? v : 0;
const todayISO  = () => new Date().toISOString().slice(0, 10);
const daysAgo   = (d: number) => { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString().slice(0, 10); };
const daysAhead = (d: number) => { const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString().slice(0, 10); };

function cleanFields(fields: Fields): Fields {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== "" && v !== null && v !== undefined));
}

const STAGE_PRIORITY: Record<string, number> = {
  "Active Referral": 6, "Shared Leads": 5, "Agreed to Refer": 4,
  "Met": 3, "Identified": 2, "Inactive Referral": 1,
};
function bestStage(stages: string[]): string {
  if (!stages.length) return "Identified";
  return stages.reduce((best, st) =>
    (STAGE_PRIORITY[st] ?? 0) > (STAGE_PRIORITY[best] ?? 0) ? st : best, stages[0]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

async function crmDashboard(): Promise<string> {
  const today = todayISO();
  const ago7  = daysAgo(7);
  const in7   = daysAhead(7);

  const [opps, contacts, recentActs, companies, clientContacts] = await Promise.all([
    atFetchAll(T.CRM_OPPORTUNITIES),
    atFetchAll(T.CRM_CONTACTS),
    atFetchAll(T.CRM_ACTIVITIES, { filterByFormula: `AND({ActivityDate} >= "${ago7}", {ActivityDate} <= "${today}")` }),
    atFetchAll(T.CRM_COMPANIES),
    atFetchAll(T.CRM_CLIENT_CONTACTS),
  ]);

  const clientById = new Map(clientContacts.map(c => [c.id, s(c.fields.Name)]));

  const pipelineByStage: Record<string, number> = {};
  const overdueNextSteps: object[] = [];
  const dueThisWeek: object[] = [];

  for (const opp of opps) {
    const stage = s(opp.fields.Stage);
    if (stage === "Won" || stage === "Lost") continue;
    pipelineByStage[stage] = (pipelineByStage[stage] ?? 0) + 1;
    const nsd  = s(opp.fields.NextStepDate);
    const name = clientById.get(s(opp.fields.ClientContactId)) ?? "(unknown)";
    const entry = { id: opp.id, clientName: name, stage, nextStep: s(opp.fields.NextStepNote), dueDate: nsd };
    if (nsd && nsd < today)  overdueNextSteps.push(entry);
    else if (nsd && nsd <= in7) dueThisWeek.push(entry);
  }

  const contactsByCompany = new Map<string, string[]>();
  for (const c of contacts) {
    const cid = s(c.fields.ReferralCompanyId);
    if (!cid) continue;
    if (!contactsByCompany.has(cid)) contactsByCompany.set(cid, []);
    contactsByCompany.get(cid)!.push(s(c.fields.Stage));
  }
  const activeReferrers = companies
    .filter(co => bestStage(contactsByCompany.get(co.id) ?? []) === "Active Referral")
    .map(co => ({ id: co.id, name: s(co.fields.Name), city: s(co.fields.City), type: s(co.fields.Type) }));

  const actByType: Record<string, number> = {};
  for (const a of recentActs) {
    const t = s(a.fields.Type) || "Other";
    actByType[t] = (actByType[t] ?? 0) + 1;
  }

  const thirtyAgo = daysAgo(30);
  const staleReferrals = contacts
    .filter(c => s(c.fields.Stage) !== "Inactive Referral" && (!s(c.fields.LastActivityDate) || s(c.fields.LastActivityDate) < thirtyAgo))
    .slice(0, 8)
    .map(c => ({ id: c.id, name: s(c.fields.Name), stage: s(c.fields.Stage), lastActivity: s(c.fields.LastActivityDate) || "never" }));

  return JSON.stringify({
    generatedAt: today,
    pipeline: {
      byStage: pipelineByStage,
      totalOpen: Object.values(pipelineByStage).reduce((a, b) => a + b, 0),
      overdueNextSteps: overdueNextSteps.slice(0, 10),
      dueThisWeek: dueThisWeek.slice(0, 10),
    },
    referralNetwork: {
      activeReferralCompanies: activeReferrers.length,
      activeReferrers: activeReferrers.slice(0, 15),
      referralContactsNeedingFollowUp: staleReferrals,
    },
    activityLast7Days: { total: recentActs.length, byType: actByType },
  }, null, 2);
}

async function getReferralPartners(args: Fields): Promise<string> {
  const stageFilter = s(args.stage_filter);
  const search      = s(args.search).toLowerCase().trim();

  const [companies, contacts] = await Promise.all([
    atFetchAll(T.CRM_COMPANIES, { "sort[0][field]": "Name", "sort[0][direction]": "asc" }),
    atFetchAll(T.CRM_CONTACTS),
  ]);

  const byCompany = new Map<string, ARecord[]>();
  for (const c of contacts) {
    const cid = s(c.fields.ReferralCompanyId);
    if (!cid) continue;
    if (!byCompany.has(cid)) byCompany.set(cid, []);
    byCompany.get(cid)!.push(c);
  }

  const result = companies
    .map(co => {
      const cc       = byCompany.get(co.id) ?? [];
      const bStage   = bestStage(cc.map(c => s(c.fields.Stage)));
      const lastAct  = cc.map(c => s(c.fields.LastActivityDate)).filter(Boolean).sort().reverse()[0] ?? "";
      return {
        id: co.id, name: s(co.fields.Name), type: s(co.fields.Type),
        city: s(co.fields.City), state: s(co.fields.State), priority: s(co.fields.Priority),
        bestStage: bStage, lastActivity: lastAct, contactCount: cc.length,
        contacts: cc.map(c => ({
          id: c.id, name: s(c.fields.Name), title: s(c.fields.Title),
          email: s(c.fields.Email), phone: s(c.fields.Phone),
          stage: s(c.fields.Stage), lastActivity: s(c.fields.LastActivityDate),
        })),
      };
    })
    .filter(co => {
      if (stageFilter && co.bestStage !== stageFilter) return false;
      if (search && !co.name.toLowerCase().includes(search) &&
          !co.city.toLowerCase().includes(search) && !co.type.toLowerCase().includes(search)) return false;
      return true;
    });

  return JSON.stringify({ count: result.length, partners: result }, null, 2);
}

async function getOpportunities(args: Fields): Promise<string> {
  const [opps, clientContacts] = await Promise.all([
    atFetchAll(T.CRM_OPPORTUNITIES, { "sort[0][field]": "NextStepDate", "sort[0][direction]": "asc" }),
    atFetchAll(T.CRM_CLIENT_CONTACTS),
  ]);
  const contactById = new Map(clientContacts.map(c => [c.id, c]));
  const stageFilter   = s(args.stage);
  const search        = s(args.search).toLowerCase().trim();
  const includeClosed = args.include_closed === true;

  const result = opps
    .map(opp => {
      const contact = contactById.get(s(opp.fields.ClientContactId));
      return {
        id: opp.id, stage: s(opp.fields.Stage),
        clientName:     contact ? s(contact.fields.Name)  : "(unknown)",
        clientEmail:    contact ? s(contact.fields.Email) : "",
        clientPhone:    contact ? s(contact.fields.Phone) : "",
        estimatedValue: n(opp.fields.EstimatedValue),
        nextStepDate:   s(opp.fields.NextStepDate),
        nextStepNote:   s(opp.fields.NextStepNote),
        notes:          s(opp.fields.Notes),
        assignedTo:     s(opp.fields.AssignedToClerkId),
      };
    })
    .filter(opp => {
      if (!includeClosed && (opp.stage === "Won" || opp.stage === "Lost")) return false;
      if (stageFilter && opp.stage !== stageFilter) return false;
      if (search && !opp.clientName.toLowerCase().includes(search) &&
          !opp.notes.toLowerCase().includes(search)) return false;
      return true;
    });

  return JSON.stringify({ count: result.length, opportunities: result }, null, 2);
}

async function searchContacts(args: Fields): Promise<string> {
  const q = s(args.query).toLowerCase().trim();
  if (!q) return JSON.stringify({ error: "query is required" });

  const [refContacts, clientContacts, companies] = await Promise.all([
    atFetchAll(T.CRM_CONTACTS),
    atFetchAll(T.CRM_CLIENT_CONTACTS),
    atFetchAll(T.CRM_COMPANIES),
  ]);
  const companyById = new Map(companies.map(c => [c.id, s(c.fields.Name)]));

  const matches: object[] = [];
  for (const c of refContacts) {
    const name = s(c.fields.Name), email = s(c.fields.Email), title = s(c.fields.Title);
    if (name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || title.toLowerCase().includes(q)) {
      matches.push({ type: "referral_contact", id: c.id, name, email, phone: s(c.fields.Phone),
        company: companyById.get(s(c.fields.ReferralCompanyId)) ?? "", stage: s(c.fields.Stage), title });
    }
  }
  for (const c of clientContacts) {
    const name = s(c.fields.Name), email = s(c.fields.Email);
    if (name.toLowerCase().includes(q) || email.toLowerCase().includes(q)) {
      matches.push({ type: "client_contact", id: c.id, name, email, phone: s(c.fields.Phone), source: s(c.fields.Source) });
    }
  }
  return JSON.stringify({ count: matches.length, results: matches }, null, 2);
}

async function getRecentActivities(args: Fields): Promise<string> {
  const days  = typeof args.days  === "number" ? Math.min(args.days,  90) : 14;
  const limit = typeof args.limit === "number" ? Math.min(args.limit, 100) : 25;
  const typeFilter = s(args.type);
  const since = daysAgo(days);

  const activities = await atFetchAll(T.CRM_ACTIVITIES, {
    filterByFormula: `{ActivityDate} >= "${since}"`,
    "sort[0][field]": "ActivityDate", "sort[0][direction]": "desc",
  });

  const [refContacts, clientContacts] = await Promise.all([
    atFetchAll(T.CRM_CONTACTS),
    atFetchAll(T.CRM_CLIENT_CONTACTS),
  ]);
  const refById    = new Map(refContacts.map(c    => [c.id, s(c.fields.Name)]));
  const clientById = new Map(clientContacts.map(c => [c.id, s(c.fields.Name)]));

  const result = activities
    .filter(a => !typeFilter || s(a.fields.Type) === typeFilter)
    .slice(0, limit)
    .map(a => {
      const cid  = s(a.fields.ClientContactId);
      return { id: a.id, date: s(a.fields.ActivityDate), type: s(a.fields.Type),
        note: s(a.fields.Note), contactName: refById.get(cid) ?? clientById.get(cid) ?? "(no contact)",
        opportunityId: s(a.fields.OpportunityId), gmailImported: a.fields.IsGmailImported === true };
    });

  return JSON.stringify({ count: result.length, activities: result }, null, 2);
}

async function getProjects(args: Fields): Promise<string> {
  const includeAll = args.include_all === true;
  const tenants = await atFetchAll(T.TENANTS, { "sort[0][field]": "Name", "sort[0][direction]": "asc" });
  const result = tenants
    .filter(t => includeAll || (!t.fields.IsArchived && !t.fields.IsConsignmentOnly))
    .map(t => ({
      id: t.id, name: s(t.fields.Name), slug: s(t.fields.Slug),
      city: s(t.fields.City), state: s(t.fields.State),
      isTTT: t.fields.IsTTT === true, isArchived: t.fields.IsArchived === true,
      isConsignmentOnly: t.fields.IsConsignmentOnly === true,
      estimatedHours: n(t.fields.EstimatedHours), payoutMethod: s(t.fields.PayoutMethod),
    }));
  return JSON.stringify({ count: result.length, projects: result }, null, 2);
}

async function createReferralCompany(args: Fields): Promise<string> {
  const name = s(args.name).trim();
  if (!name) throw new Error("name is required");
  const record = await atCreate(T.CRM_COMPANIES, cleanFields({
    Name: name, Type: s(args.type), Address: s(args.address), City: s(args.city),
    State: s(args.state), Zip: s(args.zip), Priority: s(args.priority) || "Medium",
    Notes: s(args.notes), Website: s(args.website), CreatedAt: new Date().toISOString(),
  }));
  return JSON.stringify({ success: true, message: `Created: ${name}`, id: record.id,
    tip: "Use create_referral_contact with this id to add contacts." }, null, 2);
}

async function createReferralContact(args: Fields): Promise<string> {
  const name = s(args.name).trim();
  if (!name) throw new Error("name is required");

  let companyId = s(args.company_id).trim();
  if (!companyId && args.company_name) {
    const needle  = s(args.company_name).toLowerCase().trim();
    const formula = encodeURIComponent(`LOWER({Name}) = "${needle}"`);
    const matches = await atFetchAll(T.CRM_COMPANIES, { filterByFormula: formula, maxRecords: "1" });
    if (!matches.length) {
      const all = await atFetchAll(T.CRM_COMPANIES);
      const suggestions = all
        .filter(c => s(c.fields.Name).toLowerCase().includes(needle))
        .slice(0, 5).map(c => ({ id: c.id, name: s(c.fields.Name) }));
      return JSON.stringify({ success: false, error: `Company "${args.company_name}" not found.`,
        suggestions, hint: "Use create_referral_company first, or pass company_id directly." }, null, 2);
    }
    companyId = matches[0].id;
  }
  if (!companyId) throw new Error("Either company_id or company_name is required");

  const record = await atCreate(T.CRM_CONTACTS, cleanFields({
    Name: name, ReferralCompanyId: companyId, Title: s(args.title),
    Email: s(args.email), Phone: s(args.phone), Stage: s(args.stage) || "Identified",
    Notes: s(args.notes), Interests: s(args.interests),
    DateIntroduced: s(args.date_introduced) || todayISO(), CreatedAt: new Date().toISOString(),
  }));
  return JSON.stringify({ success: true, message: `Created contact: ${name}`, id: record.id }, null, 2);
}

async function createClientLead(args: Fields): Promise<string> {
  const name = s(args.name).trim();
  if (!name) throw new Error("name is required");

  const contactRecord = await atCreate(T.CRM_CLIENT_CONTACTS, cleanFields({
    Name: name, Email: s(args.email), Phone: s(args.phone),
    Source: s(args.source) || "Referral", Notes: s(args.notes),
    CreatedAt: new Date().toISOString(),
  }));

  const oppFields: Fields = cleanFields({
    ClientContactId: contactRecord.id, Stage: "Lead",
    Notes: s(args.opportunity_notes) || s(args.notes),
    NextStepNote: s(args.next_step), NextStepDate: s(args.next_step_date),
    KeyPeople: "[]", CreatedAt: new Date().toISOString(),
  });
  if (typeof args.estimated_value === "number" && args.estimated_value > 0) {
    oppFields.EstimatedValue = args.estimated_value;
  }
  const oppRecord = await atCreate(T.CRM_OPPORTUNITIES, oppFields);

  return JSON.stringify({
    success: true, message: `Created lead: ${name}`,
    contact: { id: contactRecord.id, name, email: s(args.email) },
    opportunity: { id: oppRecord.id, stage: "Lead" },
  }, null, 2);
}

async function logActivity(args: Fields): Promise<string> {
  const type         = s(args.type).trim();
  const note         = s(args.note).trim();
  const opportunityId = s(args.opportunity_id).trim();
  const contactId    = s(args.contact_id).trim();
  const activityDate = s(args.activity_date) || todayISO();

  if (!type) throw new Error("type is required: Call, Email, Meeting, Note, Task");
  if (!note) throw new Error("note is required");
  if (!opportunityId && !contactId) throw new Error("Either opportunity_id or contact_id is required");
  if (!["Call","Email","Meeting","Note","Task"].includes(type)) throw new Error(`Invalid type: ${type}`);

  const fields: Fields = { Type: type, Note: note, ActivityDate: activityDate, IsGmailImported: false, CreatedAt: new Date().toISOString() };
  if (opportunityId) fields.OpportunityId   = opportunityId;
  if (contactId)     fields.ClientContactId = contactId;

  const record = await atCreate(T.CRM_ACTIVITIES, fields);
  if (contactId) {
    try { await atPatch(T.CRM_CONTACTS, contactId, { LastActivityDate: activityDate }); } catch { /* ok */ }
  }

  return JSON.stringify({ success: true, message: `Logged ${type} on ${activityDate}`, id: record.id, type, date: activityDate }, null, 2);
}

async function deleteActivity(args: Fields): Promise<string> {
  const id = s(args.activity_id).trim();
  if (!id) throw new Error("activity_id is required");
  if (args.confirm !== true) {
    return JSON.stringify({ success: false, warning: "Blocked. Pass confirm: true to permanently delete.", activity_id: id }, null, 2);
  }
  await atDelete(T.CRM_ACTIVITIES, id);
  return JSON.stringify({ success: true, message: `Activity ${id} deleted.` }, null, 2);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════
const TOOLS = [
  { name: "crm_dashboard", description: "Morning briefing: open pipeline by stage, overdue and upcoming next steps, active referral companies, activity volume last 7 days, and referral contacts needing follow-up.", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "get_referral_partners", description: "List all referral partner companies with contacts, best stage, and last activity. Filter by stage or search by name/city/type.", inputSchema: { type: "object", properties: { stage_filter: { type: "string", enum: ["Identified","Met","Agreed to Refer","Shared Leads","Active Referral","Inactive Referral"] }, search: { type: "string" } }, required: [] } },
  { name: "get_opportunities", description: "Client opportunity pipeline sorted by next step date. Includes client name, stage, estimated value, and next step.", inputSchema: { type: "object", properties: { stage: { type: "string", enum: ["Lead","Qualifying","Proposing","Won","Lost"] }, search: { type: "string" }, include_closed: { type: "boolean" } }, required: [] } },
  { name: "search_contacts", description: "Find a referral contact or client contact by name, email, or title. Returns Airtable IDs needed for log_activity.", inputSchema: { type: "object", properties: { query: { type: "string", description: "Name, email, or title" } }, required: ["query"] } },
  { name: "get_recent_activities", description: "Recent CRM activities — calls, emails, meetings, notes, tasks.", inputSchema: { type: "object", properties: { days: { type: "number" }, limit: { type: "number" }, type: { type: "string", enum: ["Call","Email","Meeting","Note","Task"] } }, required: [] } },
  { name: "get_projects", description: "List active client projects with city, estimated hours, and payout method.", inputSchema: { type: "object", properties: { include_all: { type: "boolean" } }, required: [] } },
  { name: "create_referral_company", description: "Add a new referral partner company to the CRM.", inputSchema: { type: "object", properties: { name: { type: "string" }, type: { type: "string" }, city: { type: "string" }, state: { type: "string" }, zip: { type: "string" }, address: { type: "string" }, priority: { type: "string", enum: ["High","Medium","Low"] }, notes: { type: "string" }, website: { type: "string" } }, required: ["name"] } },
  { name: "create_referral_contact", description: "Add a contact at a referral partner company. Provide company_id or exact company_name.", inputSchema: { type: "object", properties: { name: { type: "string" }, company_id: { type: "string" }, company_name: { type: "string" }, title: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, stage: { type: "string", enum: ["Identified","Met","Agreed to Refer","Shared Leads","Active Referral","Inactive Referral"] }, notes: { type: "string" }, interests: { type: "string" }, date_introduced: { type: "string" } }, required: ["name"] } },
  { name: "create_client_lead", description: "Create a new client lead — adds a ClientContact and an Opportunity in Lead stage.", inputSchema: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, source: { type: "string" }, notes: { type: "string" }, opportunity_notes: { type: "string" }, estimated_value: { type: "number" }, next_step: { type: "string" }, next_step_date: { type: "string" } }, required: ["name"] } },
  { name: "log_activity", description: "Log a CRM activity (Call/Email/Meeting/Note/Task) against an opportunity or contact. Use search_contacts to get contact IDs.", inputSchema: { type: "object", properties: { type: { type: "string", enum: ["Call","Email","Meeting","Note","Task"] }, note: { type: "string" }, opportunity_id: { type: "string" }, contact_id: { type: "string" }, activity_date: { type: "string" } }, required: ["type","note"] } },
  { name: "delete_activity", description: "Permanently delete a CRM activity. DESTRUCTIVE — requires confirm: true.", inputSchema: { type: "object", properties: { activity_id: { type: "string" }, confirm: { type: "boolean" } }, required: ["activity_id"] } },
];

async function dispatchTool(name: string, args: Fields): Promise<string> {
  switch (name) {
    case "crm_dashboard":          return crmDashboard();
    case "get_referral_partners":  return getReferralPartners(args);
    case "get_opportunities":      return getOpportunities(args);
    case "search_contacts":        return searchContacts(args);
    case "get_recent_activities":  return getRecentActivities(args);
    case "get_projects":           return getProjects(args);
    case "create_referral_company":return createReferralCompany(args);
    case "create_referral_contact":return createReferralContact(args);
    case "create_client_lead":     return createClientLead(args);
    case "log_activity":           return logActivity(args);
    case "delete_activity":        return deleteActivity(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MCP JSON-RPC HANDLER
// ═══════════════════════════════════════════════════════════════════════════════
function isAuthorized(req: Request): boolean {
  if (!MCP_API_KEY) return true;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader === `Bearer ${MCP_API_KEY}`) return true;
  // Also accept key as ?key= query param (for Claude.ai Connectors which don't support custom headers)
  const url = new URL(req.url);
  if (url.searchParams.get("key") === MCP_API_KEY) return true;
  return false;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return unauthorized();

  const body = await req.json() as { jsonrpc: string; method: string; params?: Record<string, unknown>; id: unknown };
  const { method, params, id } = body;

  function ok(result: unknown) {
    return NextResponse.json({ jsonrpc: "2.0", id, result });
  }
  function err(code: number, message: string) {
    return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
  }

  try {
    switch (method) {
      case "initialize":
        return ok({
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "rightsize-mcp", version: "1.0.0" },
        });

      case "notifications/initialized":
        // Notification — no response body needed
        return new Response(null, { status: 204 });

      case "tools/list":
        return ok({ tools: TOOLS });

      case "tools/call": {
        const toolName = String((params as Record<string,unknown>)?.name ?? "");
        const toolArgs = ((params as Record<string,unknown>)?.arguments ?? {}) as Fields;
        const result   = await dispatchTool(toolName, toolArgs);
        return ok({ content: [{ type: "text", text: result }] });
      }

      default:
        return err(-32601, `Method not found: ${method}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(-32000, msg);
  }
}

// Claude Code probes with GET to check the endpoint exists
export async function GET(req: Request) {
  if (!isAuthorized(req)) return unauthorized();
  return NextResponse.json({ name: "rightsize-mcp", version: "1.0.0", protocol: "MCP/2024-11-05" });
}
