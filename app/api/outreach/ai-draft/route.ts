export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { gist, channel, senderName } = await req.json().catch(() => ({})) as {
    gist?: string;
    channel?: "Email" | "SMS";
    senderName?: string;
  };

  if (!gist?.trim()) return NextResponse.json({ error: "gist required" }, { status: 400 });

  const isEmail = channel !== "SMS";
  const sender = senderName || "a Top Tier Transitions rep";

  const prompt = isEmail
    ? `You are writing a professional outreach email for Top Tier Transitions, a premium estate liquidation and move management company. The sender is ${sender}.

Write an email based on this gist from the sender:
"${gist}"

Rules (follow every one strictly):
- NEVER use em dashes (—). Use commas, periods, or short sentences instead.
- Do not write like AI. No filler phrases: "I hope this finds you well", "I wanted to reach out", "In today's world", "I trust this email", "I am pleased to", "excited to share", "touch base", "circle back", "leverage", "synergy".
- Short paragraphs. Warm but professional. Real human voice.
- Use merge tags exactly as shown: {{first_name}} for recipient's first name, {{company}} for their company name, {{rep_first_name}} for the sender's first name, {{rep_phone}} for the sender's phone, {{rep_email}} for the sender's email.
- Start the body with "Hi {{first_name}}," on its own line, then a blank line.
- End with a natural sign-off like "Thanks," or "Talk soon," on its own line, then "{{rep_first_name}}" on the next line, then "{{rep_phone}}" on the next line, then "{{rep_email}}" on the next line.
- Subject line: short (6 words max), specific, no clickbait, lowercase except first word and proper nouns.

Respond with ONLY valid JSON (no markdown, no code fences):
{"subject": "...", "body": "..."}`
    : `You are writing a professional SMS for Top Tier Transitions, a premium estate liquidation company. The sender is ${sender}.

Write an SMS based on this gist:
"${gist}"

Rules:
- NEVER use em dashes (—).
- Natural, conversational, under 160 characters.
- Use {{first_name}} and {{rep_first_name}} merge tags.
- No emojis unless the gist asks for them.

Respond with ONLY valid JSON: {"subject": "", "body": "..."}`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = (message.content[0] as { type: string; text: string }).text.trim();
    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned) as { subject: string; body: string };

    return NextResponse.json({ subject: parsed.subject ?? "", body: parsed.body ?? "" });
  } catch (err) {
    console.error("[ai-draft] error:", err);
    return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
  }
}
