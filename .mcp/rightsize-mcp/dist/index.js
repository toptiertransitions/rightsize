/**
 * Rightsize MCP Server
 * Exposes Rightsize / Top Tier Transitions data to Claude via the
 * Model Context Protocol.  Reads directly from Airtable using the same
 * API token and base ID used by the Next.js app — zero changes to existing code.
 *
 * Tools:
 *   READ    crm_dashboard, get_referral_partners, get_opportunities,
 *           search_contacts, get_recent_activities, get_projects
 *   WRITE   create_referral_company, create_referral_contact, create_client_lead,
 *           log_activity
 *   DELETE  delete_activity  (requires confirm: true)
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
// ── Environment ───────────────────────────────────────────────────────────────
const AT_TOKEN = process.env.AIRTABLE_API_TOKEN ?? "";
const AT_BASE = process.env.AIRTABLE_BASE_ID ?? "";
if (!AT_TOKEN || !AT_BASE) {
    process.stderr.write("ERROR: AIRTABLE_API_TOKEN and AIRTABLE_BASE_ID must be set in environment\n");
    process.exit(1);
}
// ── Table names — respect env overrides so they match the app's config ────────
const T = {
    TENANTS: process.env.AIRTABLE_TENANTS_TABLE ?? "Tenants",
    CRM_COMPANIES: process.env.AIRTABLE_CRM_COMPANIES_TABLE ?? "CRMReferralCompanies",
    CRM_CONTACTS: process.env.AIRTABLE_CRM_CONTACTS_TABLE ?? "CRMReferralContacts",
    CRM_CLIENT_CONTACTS: process.env.AIRTABLE_CRM_CLIENT_CONTACTS_TABLE ?? "CRMClientContacts",
    CRM_OPPORTUNITIES: process.env.AIRTABLE_CRM_OPPORTUNITIES_TABLE ?? "CRMOpportunities",
    CRM_ACTIVITIES: process.env.AIRTABLE_CRM_ACTIVITIES_TABLE ?? "CRMActivities",
};
const AT_HEADERS = {
    "Authorization": `Bearer ${AT_TOKEN}`,
    "Content-Type": "application/json",
};
async function atFetch(path, init) {
    return fetch(`https://api.airtable.com/v0/${AT_BASE}${path}`, {
        ...init,
        headers: { ...AT_HEADERS, ...(init?.headers ?? {}) },
    });
}
/** Paginated fetch — handles Airtable's 100-record pages automatically. */
async function fetchAll(table, params = {}) {
    const all = [];
    let offset;
    do {
        const sp = new URLSearchParams(params);
        if (offset)
            sp.set("offset", offset);
        const res = await atFetch(`/${encodeURIComponent(table)}?${sp}`);
        if (!res.ok)
            throw new Error(`Airtable [${table}]: ${await res.text()}`);
        const json = await res.json();
        all.push(...json.records);
        offset = json.offset;
    } while (offset);
    return all;
}
async function atCreate(table, fields) {
    const res = await atFetch(`/${encodeURIComponent(table)}`, {
        method: "POST",
        body: JSON.stringify({ fields }),
    });
    if (!res.ok)
        throw new Error(`Airtable create [${table}]: ${await res.text()}`);
    return res.json();
}
async function atPatch(table, id, fields) {
    const res = await atFetch(`/${encodeURIComponent(table)}/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ fields }),
    });
    if (!res.ok)
        throw new Error(`Airtable patch [${table}/${id}]: ${await res.text()}`);
}
async function atDelete(table, id) {
    const res = await atFetch(`/${encodeURIComponent(table)}/${id}`, { method: "DELETE" });
    if (!res.ok)
        throw new Error(`Airtable delete [${table}/${id}]: ${await res.text()}`);
}
// ── Small utilities ───────────────────────────────────────────────────────────
const s = (v) => typeof v === "string" ? v : "";
const n = (v) => typeof v === "number" ? v : 0;
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgo = (d) => { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString().slice(0, 10); };
const daysAhead = (d) => { const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString().slice(0, 10); };
/** Strip empty-string fields before sending to Airtable. */
function cleanFields(fields) {
    return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== "" && v !== null && v !== undefined));
}
// ── Referral stage priority (mirrors the app's REFERRAL_STAGE_PRIORITY) ───────
const STAGE_PRIORITY = {
    "Active Referral": 6,
    "Shared Leads": 5,
    "Agreed to Refer": 4,
    "Met": 3,
    "Identified": 2,
    "Inactive Referral": 1,
};
function bestStage(stages) {
    if (stages.length === 0)
        return "Identified";
    return stages.reduce((best, st) => (STAGE_PRIORITY[st] ?? 0) > (STAGE_PRIORITY[best] ?? 0) ? st : best, stages[0]);
}
// ═════════════════════════════════════════════════════════════════════════════
// TOOL HANDLERS
// ═════════════════════════════════════════════════════════════════════════════
// ── crm_dashboard ─────────────────────────────────────────────────────────────
async function crmDashboard() {
    const today = todayISO();
    const ago7 = daysAgo(7);
    const in7 = daysAhead(7);
    const [opps, contacts, recentActs, companies, clientContacts] = await Promise.all([
        fetchAll(T.CRM_OPPORTUNITIES),
        fetchAll(T.CRM_CONTACTS),
        fetchAll(T.CRM_ACTIVITIES, {
            filterByFormula: `AND({ActivityDate} >= "${ago7}", {ActivityDate} <= "${today}")`,
        }),
        fetchAll(T.CRM_COMPANIES),
        fetchAll(T.CRM_CLIENT_CONTACTS),
    ]);
    const clientById = new Map(clientContacts.map(c => [c.id, s(c.fields.Name)]));
    // Open opportunity pipeline
    const pipelineByStage = {};
    const overdueNextSteps = [];
    const dueThisWeek = [];
    for (const opp of opps) {
        const stage = s(opp.fields.Stage);
        if (stage === "Won" || stage === "Lost")
            continue;
        pipelineByStage[stage] = (pipelineByStage[stage] ?? 0) + 1;
        const nsd = s(opp.fields.NextStepDate);
        const clientName = clientById.get(s(opp.fields.ClientContactId)) ?? s(opp.fields.ClientContactId);
        const entry = { id: opp.id, clientName, stage, nextStep: s(opp.fields.NextStepNote), dueDate: nsd };
        if (nsd && nsd < today)
            overdueNextSteps.push(entry);
        else if (nsd && nsd <= in7)
            dueThisWeek.push(entry);
    }
    // Sort by date ascending
    overdueNextSteps.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    dueThisWeek.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    // Active referral companies
    const contactsByCompany = new Map();
    for (const c of contacts) {
        const cid = s(c.fields.ReferralCompanyId);
        if (!cid)
            continue;
        if (!contactsByCompany.has(cid))
            contactsByCompany.set(cid, []);
        contactsByCompany.get(cid).push(s(c.fields.Stage));
    }
    const activeReferrers = companies
        .filter(co => bestStage(contactsByCompany.get(co.id) ?? []) === "Active Referral")
        .map(co => ({ id: co.id, name: s(co.fields.Name), city: s(co.fields.City), type: s(co.fields.Type) }));
    // Activity breakdown
    const actByType = {};
    for (const a of recentActs) {
        const t = s(a.fields.Type) || "Other";
        actByType[t] = (actByType[t] ?? 0) + 1;
    }
    // Referral contacts needing follow-up (no activity in 30+ days)
    const thirtyDaysAgo = daysAgo(30);
    const staleReferrals = contacts
        .filter(c => {
        const stage = s(c.fields.Stage);
        if (stage === "Inactive Referral")
            return false;
        const last = s(c.fields.LastActivityDate);
        return !last || last < thirtyDaysAgo;
    })
        .slice(0, 8)
        .map(c => ({ id: c.id, name: s(c.fields.Name), company: s(c.fields.ReferralCompanyId), stage: s(c.fields.Stage), lastActivity: s(c.fields.LastActivityDate) || "never" }));
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
        activityLast7Days: {
            total: recentActs.length,
            byType: actByType,
        },
    }, null, 2);
}
// ── get_referral_partners ──────────────────────────────────────────────────────
async function getReferralPartners(args) {
    const stageFilter = s(args.stage_filter);
    const search = s(args.search).toLowerCase().trim();
    const [companies, contacts] = await Promise.all([
        fetchAll(T.CRM_COMPANIES, { "sort[0][field]": "Name", "sort[0][direction]": "asc" }),
        fetchAll(T.CRM_CONTACTS),
    ]);
    // Group contacts by company
    const byCompany = new Map();
    for (const c of contacts) {
        const cid = s(c.fields.ReferralCompanyId);
        if (!cid)
            continue;
        if (!byCompany.has(cid))
            byCompany.set(cid, []);
        byCompany.get(cid).push(c);
    }
    const result = companies
        .map(co => {
        const compContacts = byCompany.get(co.id) ?? [];
        const stages = compContacts.map(c => s(c.fields.Stage));
        const bStage = bestStage(stages);
        const lastActivity = compContacts
            .map(c => s(c.fields.LastActivityDate))
            .filter(Boolean)
            .sort()
            .reverse()[0] ?? "";
        return {
            id: co.id,
            name: s(co.fields.Name),
            type: s(co.fields.Type),
            city: s(co.fields.City),
            state: s(co.fields.State),
            priority: s(co.fields.Priority),
            bestStage: bStage,
            lastActivity,
            contactCount: compContacts.length,
            contacts: compContacts.map(c => ({
                id: c.id,
                name: s(c.fields.Name),
                title: s(c.fields.Title),
                email: s(c.fields.Email),
                phone: s(c.fields.Phone),
                stage: s(c.fields.Stage),
                lastActivity: s(c.fields.LastActivityDate),
            })),
        };
    })
        .filter(co => {
        if (stageFilter && co.bestStage !== stageFilter)
            return false;
        if (search && !co.name.toLowerCase().includes(search) &&
            !co.city.toLowerCase().includes(search) &&
            !co.type.toLowerCase().includes(search))
            return false;
        return true;
    });
    return JSON.stringify({ count: result.length, partners: result }, null, 2);
}
// ── get_opportunities ─────────────────────────────────────────────────────────
async function getOpportunities(args) {
    const stageFilter = s(args.stage);
    const search = s(args.search).toLowerCase().trim();
    const includeClosed = args.include_closed === true;
    const [opps, clientContacts] = await Promise.all([
        fetchAll(T.CRM_OPPORTUNITIES, {
            "sort[0][field]": "NextStepDate",
            "sort[0][direction]": "asc",
        }),
        fetchAll(T.CRM_CLIENT_CONTACTS),
    ]);
    const contactById = new Map(clientContacts.map(c => [c.id, c]));
    const result = opps
        .map(opp => {
        const contact = contactById.get(s(opp.fields.ClientContactId));
        return {
            id: opp.id,
            stage: s(opp.fields.Stage),
            clientName: contact ? s(contact.fields.Name) : "(unknown)",
            clientEmail: contact ? s(contact.fields.Email) : "",
            clientPhone: contact ? s(contact.fields.Phone) : "",
            estimatedValue: n(opp.fields.EstimatedValue),
            nextStepDate: s(opp.fields.NextStepDate),
            nextStepNote: s(opp.fields.NextStepNote),
            notes: s(opp.fields.Notes),
            assignedTo: s(opp.fields.AssignedToClerkId),
            createdAt: s(opp.fields.CreatedAt),
        };
    })
        .filter(opp => {
        if (!includeClosed && (opp.stage === "Won" || opp.stage === "Lost"))
            return false;
        if (stageFilter && opp.stage !== stageFilter)
            return false;
        if (search && !opp.clientName.toLowerCase().includes(search) &&
            !opp.notes.toLowerCase().includes(search))
            return false;
        return true;
    });
    return JSON.stringify({ count: result.length, opportunities: result }, null, 2);
}
// ── search_contacts ───────────────────────────────────────────────────────────
async function searchContacts(args) {
    const q = s(args.query).toLowerCase().trim();
    if (!q)
        return JSON.stringify({ error: "query is required" });
    const [refContacts, clientContacts, companies] = await Promise.all([
        fetchAll(T.CRM_CONTACTS),
        fetchAll(T.CRM_CLIENT_CONTACTS),
        fetchAll(T.CRM_COMPANIES),
    ]);
    const companyById = new Map(companies.map(c => [c.id, s(c.fields.Name)]));
    const matches = [];
    for (const c of refContacts) {
        const name = s(c.fields.Name);
        const email = s(c.fields.Email);
        const title = s(c.fields.Title);
        if (name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || title.toLowerCase().includes(q)) {
            matches.push({
                type: "referral_contact",
                id: c.id,
                name,
                email,
                phone: s(c.fields.Phone),
                company: companyById.get(s(c.fields.ReferralCompanyId)) ?? "",
                stage: s(c.fields.Stage),
                title,
            });
        }
    }
    for (const c of clientContacts) {
        const name = s(c.fields.Name);
        const email = s(c.fields.Email);
        if (name.toLowerCase().includes(q) || email.toLowerCase().includes(q)) {
            matches.push({
                type: "client_contact",
                id: c.id,
                name,
                email,
                phone: s(c.fields.Phone),
                source: s(c.fields.Source),
            });
        }
    }
    return JSON.stringify({ count: matches.length, results: matches }, null, 2);
}
// ── get_recent_activities ─────────────────────────────────────────────────────
async function getRecentActivities(args) {
    const days = typeof args.days === "number" ? Math.min(args.days, 90) : 14;
    const limit = typeof args.limit === "number" ? Math.min(args.limit, 100) : 25;
    const typeFilter = s(args.type);
    const since = daysAgo(days);
    const activities = await fetchAll(T.CRM_ACTIVITIES, {
        filterByFormula: `{ActivityDate} >= "${since}"`,
        "sort[0][field]": "ActivityDate",
        "sort[0][direction]": "desc",
    });
    const [refContacts, clientContacts] = await Promise.all([
        fetchAll(T.CRM_CONTACTS),
        fetchAll(T.CRM_CLIENT_CONTACTS),
    ]);
    const refById = new Map(refContacts.map(c => [c.id, s(c.fields.Name)]));
    const clientById = new Map(clientContacts.map(c => [c.id, s(c.fields.Name)]));
    const result = activities
        .filter(a => !typeFilter || s(a.fields.Type) === typeFilter)
        .slice(0, limit)
        .map(a => {
        const cid = s(a.fields.ClientContactId);
        const contactName = refById.get(cid) ?? clientById.get(cid) ?? "";
        return {
            id: a.id,
            date: s(a.fields.ActivityDate),
            type: s(a.fields.Type),
            note: s(a.fields.Note),
            contactName: contactName || "(no contact)",
            opportunityId: s(a.fields.OpportunityId),
            gmailImported: a.fields.IsGmailImported === true,
        };
    });
    return JSON.stringify({ count: result.length, activities: result }, null, 2);
}
// ── get_projects ──────────────────────────────────────────────────────────────
async function getProjects(args) {
    const includeAll = args.include_all === true;
    const tenants = await fetchAll(T.TENANTS, {
        "sort[0][field]": "Name",
        "sort[0][direction]": "asc",
    });
    const result = tenants
        .filter(t => includeAll || (!t.fields.IsArchived && !t.fields.IsConsignmentOnly))
        .map(t => ({
        id: t.id,
        name: s(t.fields.Name),
        slug: s(t.fields.Slug),
        city: s(t.fields.City),
        state: s(t.fields.State),
        isTTT: t.fields.IsTTT === true,
        isArchived: t.fields.IsArchived === true,
        isConsignmentOnly: t.fields.IsConsignmentOnly === true,
        estimatedHours: n(t.fields.EstimatedHours),
        payoutMethod: s(t.fields.PayoutMethod),
        createdAt: s(t.fields.CreatedAt),
    }));
    return JSON.stringify({ count: result.length, projects: result }, null, 2);
}
// ── create_referral_company ────────────────────────────────────────────────────
async function createReferralCompany(args) {
    const name = s(args.name).trim();
    if (!name)
        throw new Error("name is required");
    const record = await atCreate(T.CRM_COMPANIES, cleanFields({
        Name: name,
        Type: s(args.type),
        Address: s(args.address),
        City: s(args.city),
        State: s(args.state),
        Zip: s(args.zip),
        Priority: s(args.priority) || "Medium",
        Notes: s(args.notes),
        Website: s(args.website),
        CreatedAt: new Date().toISOString(),
    }));
    return JSON.stringify({
        success: true,
        message: `Created referral company: ${name}`,
        id: record.id,
        tip: "Use create_referral_contact with this company's id to add contacts.",
    }, null, 2);
}
// ── create_referral_contact ────────────────────────────────────────────────────
async function createReferralContact(args) {
    const name = s(args.name).trim();
    if (!name)
        throw new Error("name is required");
    // Resolve company ID
    let companyId = s(args.company_id).trim();
    if (!companyId && args.company_name) {
        const needle = s(args.company_name).toLowerCase().trim();
        const formula = encodeURIComponent(`LOWER({Name}) = "${needle}"`);
        const matches = await fetchAll(T.CRM_COMPANIES, { filterByFormula: formula, maxRecords: "1" });
        if (matches.length === 0) {
            // Fuzzy suggestions
            const all = await fetchAll(T.CRM_COMPANIES);
            const suggestions = all
                .filter(c => s(c.fields.Name).toLowerCase().includes(needle))
                .slice(0, 5)
                .map(c => ({ id: c.id, name: s(c.fields.Name) }));
            return JSON.stringify({
                success: false,
                error: `Company "${args.company_name}" not found.`,
                suggestions,
                hint: "Pass company_id directly, or call create_referral_company first.",
            }, null, 2);
        }
        companyId = matches[0].id;
    }
    if (!companyId)
        throw new Error("Either company_id or company_name is required");
    const record = await atCreate(T.CRM_CONTACTS, cleanFields({
        Name: name,
        ReferralCompanyId: companyId,
        Title: s(args.title),
        Email: s(args.email),
        Phone: s(args.phone),
        Stage: s(args.stage) || "Identified",
        Notes: s(args.notes),
        Interests: s(args.interests),
        DateIntroduced: s(args.date_introduced) || todayISO(),
        CreatedAt: new Date().toISOString(),
    }));
    return JSON.stringify({
        success: true,
        message: `Created referral contact: ${name}`,
        id: record.id,
        tip: "Use log_activity with this contact's id to record your first interaction.",
    }, null, 2);
}
// ── create_client_lead ────────────────────────────────────────────────────────
async function createClientLead(args) {
    const name = s(args.name).trim();
    if (!name)
        throw new Error("name is required");
    // 1. Create the ClientContact record
    const contactRecord = await atCreate(T.CRM_CLIENT_CONTACTS, cleanFields({
        Name: name,
        Email: s(args.email),
        Phone: s(args.phone),
        Source: s(args.source) || "Referral",
        Notes: s(args.notes),
        CreatedAt: new Date().toISOString(),
    }));
    // 2. Create the Opportunity in Lead stage
    const oppFields = cleanFields({
        ClientContactId: contactRecord.id,
        Stage: "Lead",
        Notes: s(args.opportunity_notes) || s(args.notes),
        NextStepNote: s(args.next_step),
        NextStepDate: s(args.next_step_date),
        KeyPeople: "[]",
        CreatedAt: new Date().toISOString(),
    });
    if (typeof args.estimated_value === "number" && args.estimated_value > 0) {
        oppFields.EstimatedValue = args.estimated_value;
    }
    const oppRecord = await atCreate(T.CRM_OPPORTUNITIES, oppFields);
    return JSON.stringify({
        success: true,
        message: `Created client lead: ${name}`,
        contact: {
            id: contactRecord.id,
            name,
            email: s(args.email),
            phone: s(args.phone),
        },
        opportunity: {
            id: oppRecord.id,
            stage: "Lead",
            estimatedValue: n(args.estimated_value),
            nextStep: s(args.next_step),
            nextStepDate: s(args.next_step_date),
        },
        tip: "Use log_activity with the opportunity id to record the first interaction.",
    }, null, 2);
}
// ── log_activity ──────────────────────────────────────────────────────────────
async function logActivity(args) {
    const type = s(args.type).trim();
    const note = s(args.note).trim();
    const opportunityId = s(args.opportunity_id).trim();
    const contactId = s(args.contact_id).trim();
    const activityDate = s(args.activity_date) || todayISO();
    if (!type)
        throw new Error("type is required: Call, Email, Meeting, Note, Task");
    if (!note)
        throw new Error("note is required");
    if (!opportunityId && !contactId) {
        throw new Error("Either opportunity_id or contact_id is required — use search_contacts to find IDs");
    }
    const VALID_TYPES = ["Call", "Email", "Meeting", "Note", "Task"];
    if (!VALID_TYPES.includes(type)) {
        throw new Error(`type must be one of: ${VALID_TYPES.join(", ")}`);
    }
    const fields = {
        Type: type,
        Note: note,
        ActivityDate: activityDate,
        IsGmailImported: false,
        CreatedAt: new Date().toISOString(),
    };
    if (opportunityId)
        fields.OpportunityId = opportunityId;
    if (contactId)
        fields.ClientContactId = contactId;
    const record = await atCreate(T.CRM_ACTIVITIES, fields);
    // Update LastActivityDate on the referral contact (best-effort — silently
    // skip if contactId belongs to a ClientContact instead)
    if (contactId) {
        try {
            await atPatch(T.CRM_CONTACTS, contactId, { LastActivityDate: activityDate });
        }
        catch { /* not a referral contact — that's fine */ }
    }
    return JSON.stringify({
        success: true,
        message: `Logged ${type} on ${activityDate}`,
        id: record.id,
        type,
        date: activityDate,
        note: note.length > 120 ? note.slice(0, 120) + "…" : note,
        linkedTo: opportunityId ? `opportunity:${opportunityId}` : `contact:${contactId}`,
    }, null, 2);
}
// ── delete_activity ───────────────────────────────────────────────────────────
async function deleteActivity(args) {
    const id = s(args.activity_id).trim();
    if (!id)
        throw new Error("activity_id is required");
    // Safety gate — must explicitly pass confirm: true
    if (args.confirm !== true) {
        return JSON.stringify({
            success: false,
            warning: "Destructive operation blocked.",
            instruction: "Add confirm: true to permanently delete this activity.",
            activity_id: id,
        }, null, 2);
    }
    await atDelete(T.CRM_ACTIVITIES, id);
    return JSON.stringify({
        success: true,
        message: `Activity ${id} permanently deleted.`,
        activity_id: id,
    }, null, 2);
}
// ═════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═════════════════════════════════════════════════════════════════════════════
const TOOLS = [
    {
        name: "crm_dashboard",
        description: "Morning briefing: open opportunity pipeline by stage, overdue and upcoming next steps, " +
            "active referral companies, activity volume last 7 days, and referral contacts overdue for follow-up. " +
            "Call this first when asked for a CRM status update or daily priorities.",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
        name: "get_referral_partners",
        description: "List all referral partner companies with their contacts, best relationship stage, " +
            "and last activity date. Use to browse the referral network, find specific companies, " +
            "or identify who needs follow-up.",
        inputSchema: {
            type: "object",
            properties: {
                stage_filter: {
                    type: "string",
                    description: "Filter companies by their best contact stage",
                    enum: ["Identified", "Met", "Agreed to Refer", "Shared Leads", "Active Referral", "Inactive Referral"],
                },
                search: { type: "string", description: "Search by company name, city, or type" },
            },
            required: [],
        },
    },
    {
        name: "get_opportunities",
        description: "Client opportunity pipeline. Returns opportunities sorted by next step date ascending " +
            "(most urgent first). Includes client name, stage, value, next step note, and assigned rep.",
        inputSchema: {
            type: "object",
            properties: {
                stage: {
                    type: "string",
                    description: "Filter by opportunity stage",
                    enum: ["Lead", "Qualifying", "Proposing", "Won", "Lost"],
                },
                search: { type: "string", description: "Search by client name or notes" },
                include_closed: { type: "boolean", description: "Include Won and Lost (default false)" },
            },
            required: [],
        },
    },
    {
        name: "search_contacts",
        description: "Search for a person by name, email, or job title. Returns matching referral contacts " +
            "and client contacts with their IDs. Use before log_activity or create_referral_contact " +
            "when you need an Airtable record ID.",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Name, email, or title to search (required)" },
            },
            required: ["query"],
        },
    },
    {
        name: "get_recent_activities",
        description: "Recent CRM activity log — calls, emails, meetings, notes, tasks. " +
            "Useful for catching up on what's happened, reviewing a contact's history, or preparing for a meeting.",
        inputSchema: {
            type: "object",
            properties: {
                days: { type: "number", description: "How many days back to look (default 14, max 90)" },
                limit: { type: "number", description: "Max records to return (default 25, max 100)" },
                type: {
                    type: "string",
                    description: "Filter by activity type",
                    enum: ["Call", "Email", "Meeting", "Note", "Task"],
                },
            },
            required: [],
        },
    },
    {
        name: "get_projects",
        description: "List active client projects. Use to see what's currently in flight, " +
            "find project IDs, or check project details like city, estimated hours, and payout method.",
        inputSchema: {
            type: "object",
            properties: {
                include_all: {
                    type: "boolean",
                    description: "Include archived and post-move consignment projects (default false — active only)",
                },
            },
            required: [],
        },
    },
    {
        name: "create_referral_company",
        description: "Add a new referral partner company to the CRM. After creating, " +
            "use create_referral_contact to add people at that company.",
        inputSchema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Company name (required)" },
                type: { type: "string", description: "e.g. Senior Living, Estate Attorney, Realtor, Financial Advisor" },
                city: { type: "string", description: "City" },
                state: { type: "string", description: "State abbreviation (e.g. IL)" },
                zip: { type: "string", description: "Zip code" },
                address: { type: "string", description: "Street address" },
                priority: { type: "string", description: "High, Medium (default), or Low", enum: ["High", "Medium", "Low"] },
                notes: { type: "string", description: "Any notes about the company" },
                website: { type: "string", description: "Website URL" },
            },
            required: ["name"],
        },
    },
    {
        name: "create_referral_contact",
        description: "Add a contact person at a referral partner company. " +
            "Provide company_id (preferred) or an exact company_name. " +
            "If the company doesn't exist yet, call create_referral_company first.",
        inputSchema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Contact full name (required)" },
                company_id: { type: "string", description: "Airtable record ID of the referral company (preferred)" },
                company_name: { type: "string", description: "Exact company name — used to look up company_id if not provided" },
                title: { type: "string", description: "Job title / role" },
                email: { type: "string", description: "Email address" },
                phone: { type: "string", description: "Phone number" },
                stage: {
                    type: "string",
                    description: "Relationship stage (default Identified)",
                    enum: ["Identified", "Met", "Agreed to Refer", "Shared Leads", "Active Referral", "Inactive Referral"],
                },
                notes: { type: "string", description: "Notes about this person" },
                interests: { type: "string", description: "Personal interests — useful for relationship building" },
                date_introduced: { type: "string", description: "Date first met (YYYY-MM-DD, defaults to today)" },
            },
            required: ["name"],
        },
    },
    {
        name: "create_client_lead",
        description: "Create a new client lead. Adds both a ClientContact record and an Opportunity in Lead stage. " +
            "Use when someone expresses interest in TTT services.",
        inputSchema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Client full name (required)" },
                email: { type: "string", description: "Email address" },
                phone: { type: "string", description: "Phone number" },
                source: { type: "string", description: "How they found TTT — e.g. Referral, Website, Event" },
                notes: { type: "string", description: "Background about the client or situation" },
                opportunity_notes: { type: "string", description: "Opportunity-specific notes (if different from contact notes)" },
                estimated_value: { type: "number", description: "Estimated project value in dollars" },
                next_step: { type: "string", description: "What's the next action to take?" },
                next_step_date: { type: "string", description: "Date for next step (YYYY-MM-DD)" },
            },
            required: ["name"],
        },
    },
    {
        name: "log_activity",
        description: "Log a CRM activity — call, email, meeting, note, or task — against an opportunity or contact. " +
            "Use search_contacts to find a contact_id, or get_opportunities to find an opportunity_id.",
        inputSchema: {
            type: "object",
            properties: {
                type: {
                    type: "string",
                    description: "Activity type (required)",
                    enum: ["Call", "Email", "Meeting", "Note", "Task"],
                },
                note: { type: "string", description: "What happened or what was discussed (required)" },
                opportunity_id: { type: "string", description: "Airtable record ID of the opportunity" },
                contact_id: { type: "string", description: "Airtable record ID of the referral or client contact" },
                activity_date: { type: "string", description: "Date of activity (YYYY-MM-DD, defaults to today)" },
            },
            required: ["type", "note"],
        },
    },
    {
        name: "delete_activity",
        description: "Permanently delete a CRM activity. DESTRUCTIVE — cannot be undone. " +
            "You MUST pass confirm: true or the deletion will be blocked. " +
            "Use get_recent_activities to find the activity_id first.",
        inputSchema: {
            type: "object",
            properties: {
                activity_id: { type: "string", description: "Airtable record ID of the activity to delete (required)" },
                confirm: { type: "boolean", description: "Must be exactly true to proceed" },
            },
            required: ["activity_id"],
        },
    },
];
// ═════════════════════════════════════════════════════════════════════════════
// SERVER
// ═════════════════════════════════════════════════════════════════════════════
const server = new Server({ name: "rightsize-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {});
    try {
        let result;
        switch (name) {
            case "crm_dashboard":
                result = await crmDashboard();
                break;
            case "get_referral_partners":
                result = await getReferralPartners(a);
                break;
            case "get_opportunities":
                result = await getOpportunities(a);
                break;
            case "search_contacts":
                result = await searchContacts(a);
                break;
            case "get_recent_activities":
                result = await getRecentActivities(a);
                break;
            case "get_projects":
                result = await getProjects(a);
                break;
            case "create_referral_company":
                result = await createReferralCompany(a);
                break;
            case "create_referral_contact":
                result = await createReferralContact(a);
                break;
            case "create_client_lead":
                result = await createClientLead(a);
                break;
            case "log_activity":
                result = await logActivity(a);
                break;
            case "delete_activity":
                result = await deleteActivity(a);
                break;
            default:
                return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
        }
        return { content: [{ type: "text", text: result }] };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
});
const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("Rightsize MCP server ready\n");
