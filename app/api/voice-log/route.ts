import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSystemRole, getReferralCompanies, getReferralContacts, getClientContacts } from "@/lib/airtable";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { transcript } = await req.json();
  if (!transcript?.trim()) return NextResponse.json({ error: "No transcript provided" }, { status: 400 });

  const [companies, referralContacts, clientContacts] = await Promise.all([
    getReferralCompanies(),
    getReferralContacts(),
    getClientContacts(),
  ]);

  const companyMap = new Map(companies.map(c => [c.id, c]));
  const today = new Date().toISOString().split("T")[0];

  const refContactList = referralContacts
    .map(c => `- ${c.name}${c.title ? ` (${c.title})` : ""} at ${companyMap.get(c.referralCompanyId)?.name ?? "Unknown"} [refContactId: ${c.id}]`)
    .join("\n");

  const companyList = companies
    .map(c => `- ${c.name}${c.type ? ` (${c.type})` : ""} [companyId: ${c.id}]`)
    .join("\n");

  const clientList = clientContacts
    .map(c => `- ${c.name}${c.email ? ` <${c.email}>` : ""} [clientId: ${c.id}]`)
    .join("\n");

  const prompt = `You are a CRM assistant for Top Tier Transitions, a home transition and estate management company in Chicago. They work with real estate agents, estate attorneys, financial advisors, and senior living facilities as referral partners.

TODAY: ${today}

REFERRAL PARTNER CONTACTS (use these IDs when matching):
${refContactList || "(none yet)"}

REFERRAL PARTNER COMPANIES (use these IDs when matching):
${companyList || "(none yet)"}

CLIENT CONTACTS:
${clientList || "(none yet)"}

VOICE TRANSCRIPT:
"""
${transcript}
"""

Parse this transcript into structured CRM data. Return ONLY a valid JSON object with no markdown, no extra text:

{
  "activitiesToLog": [
    {
      "contactId": "<refContactId from list above if matched, else null>",
      "contactName": "<name as mentioned or matched>",
      "companyName": "<company name>",
      "type": "<Call|Email|Meeting|Note|Task|Text Message>",
      "date": "<ISO YYYY-MM-DD, convert relative dates using TODAY, default to today>",
      "notes": "<descriptive note summarizing the interaction>"
    }
  ],
  "nextSteps": [
    {
      "contactId": "<refContactId if matched, else null>",
      "contactName": "<name>",
      "companyName": "<company>",
      "nextStepDate": "<ISO YYYY-MM-DD or null>",
      "nextStepNote": "<what needs to happen>"
    }
  ],
  "newClientLeads": [
    {
      "name": "<full name>",
      "email": "<email or null>",
      "phone": "<phone or null>",
      "source": "<referral source if mentioned, else null>",
      "notes": "<context>"
    }
  ],
  "newReferralContacts": [
    {
      "name": "<full name>",
      "title": "<job title or null>",
      "email": "<email or null>",
      "phone": "<phone or null>",
      "companyName": "<company name>",
      "companyId": "<companyId from list above if matched, else null>",
      "notes": "<context>",
      "stage": "Identified"
    }
  ]
}

Rules:
1. Only create entries for things clearly mentioned in the transcript — do not fabricate
2. Match names to existing contacts/companies using fuzzy matching where reasonable
3. Use null for any field that cannot be determined — never guess
4. Convert relative date expressions ("yesterday", "last Tuesday", "next week") using TODAY
5. For activity type: Meeting = in-person or video, Call = phone, Email = email reference, Note = general info
6. If the transcript mentions following up or a next step, put it in nextSteps (not just activitiesToLog)
7. Only add to newClientLeads if someone is described as a potential client, homeowner needing services, or lead
8. Only add to newReferralContacts if someone is a new professional contact (agent, attorney, advisor, etc.) not yet in the system`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    // Strip any markdown code fences if present
    let text = content.text.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }

    const parsed = JSON.parse(text);

    // Normalize nulls and ensure array types
    return NextResponse.json({
      activitiesToLog: Array.isArray(parsed.activitiesToLog) ? parsed.activitiesToLog : [],
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
      newClientLeads: Array.isArray(parsed.newClientLeads) ? parsed.newClientLeads : [],
      newReferralContacts: Array.isArray(parsed.newReferralContacts) ? parsed.newReferralContacts : [],
    });
  } catch (e) {
    console.error("[voice-log] parse error:", e);
    return NextResponse.json({ error: "Failed to parse transcript" }, { status: 500 });
  }
}
