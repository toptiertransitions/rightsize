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

  const { gist, ctaLink, ctaLabel, senderName } = await req.json().catch(() => ({})) as {
    gist?: string;
    ctaLink?: string;
    ctaLabel?: string;
    senderName?: string;
  };

  if (!gist?.trim()) return NextResponse.json({ error: "gist required" }, { status: 400 });

  const sender = senderName || "a Top Tier Transitions rep";

  const prompt = `You are a world-class HTML email designer for Top Tier Transitions — a premium estate liquidation and move management company.

Brand:
- Company: Top Tier Transitions
- Tagline: White Glove Senior Move Management. Done Right.
- Primary: #2d4a3e (dark forest green)
- Accent: #4a7c5f
- Background: #f5f4f0 (warm off-white)
- Font: Georgia serif for headings, Arial sans for body
- Tone: Warm, premium, human — NOT corporate AI

Sender: ${sender}
Gist of what to communicate: "${gist}"
${ctaLink ? `CTA button label: "${ctaLabel || "Learn More"}", URL: ${ctaLink}` : "No CTA"}

Generate a complete standalone HTML email. Requirements:
- Return ONLY valid JSON (no markdown fences): {"subject": "...", "html": "..."}
- The html must be a full HTML document with inline CSS only (no <style> blocks)
- Header: #2d4a3e background, "Top Tier Transitions" in white Georgia 24px bold, tagline "White Glove Senior Move Management. Done Right." in #a7c4b5 14px below
- White content area, 32px padding, 600px max-width centered
- Body starts with "Hi {{first_name}}," on its own line, then a blank line
- Leave {{first_name}}, {{last_name}}, {{company}}, {{rep_first_name}} exactly as-is
- ${ctaLink ? `Include a centered CTA button: #2d4a3e background, white text, Georgia font, 14px 32px padding, 4px border-radius, <a href="${ctaLink}"> tag, label "${ctaLabel || "Learn More"}"` : "No CTA button"}
- Footer: #f5f4f0 bg, 16px padding, center-aligned, gray 12px text, "Top Tier Transitions" and "{{rep_first_name}}"
- No em dashes anywhere
- Subject: short (6 words max), specific, real human voice`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = (message.content[0] as { type: string; text: string }).text.trim();
    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned) as { subject: string; html: string };

    return NextResponse.json({ subject: parsed.subject ?? "", html: parsed.html ?? "" });
  } catch (err) {
    console.error("[ai-branded-email] error:", err);
    return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
  }
}
