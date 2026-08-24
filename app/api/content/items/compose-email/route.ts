export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { getContentItemById } from "@/lib/airtable-content";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { itemId, emailFormat, senderName } = await req.json().catch(() => ({}));
  if (!itemId) return NextResponse.json({ error: "Missing itemId" }, { status: 400 });

  const item = await getContentItemById(itemId);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const anthropic = new Anthropic();
  const hasFile = !!(item.fileUrl && ["PDF", "Image"].includes(item.contentType));
  const ctaLink = item.linkUrl ?? "";
  const isText = emailFormat !== "branded";

  const baseInfo = `Resource: "${item.title}"
${item.description ? `Description: ${item.description}` : ""}
Content type: ${item.contentType}
${ctaLink ? `CTA URL: ${ctaLink}` : "The resource will be attached to the email"}
Sender: ${senderName ?? "Top Tier Transitions team"}
${hasFile ? "The file is attached — read it carefully and reference specific details, stats, or key points." : ""}`;

  const systemPrompt = isText
    ? `You are an expert email copywriter for Top Tier Transitions (senior move management company). Respond with ONLY a valid JSON object and nothing else — no preamble, no markdown. Keys: "subject" (string, 6-8 words max, specific and human) and "body" (string, plain text email body with merge tags).`
    : `You are an expert HTML email copywriter. Respond with ONLY a valid JSON object and nothing else — no preamble, no markdown. Keys: "subject" (string, 6-8 words max) and "html" (string, complete standalone HTML email document with inline CSS only).`;

  const textPrompt = `${baseInfo}

Write a personal, warm email from a TTT team member to a referral partner sharing this resource.

Requirements:
- Open with "Hi {{first_name}},"
- 2-3 short paragraphs, specific to this content — not generic
- ${ctaLink ? `Reference the CTA naturally, don't just say "click here"` : "Mention the resource is attached"}
- Sign off from {{rep_first_name}} at Top Tier Transitions
- Merge tags exactly: {{first_name}}, {{last_name}}, {{company}}, {{rep_first_name}}, {{rep_phone}}, {{rep_email}}
- Rep phone: whenever a phone number is referenced, write {{rep_phone}} — NEVER a literal number
- Rep email: whenever an email address is referenced, write {{rep_email}} — NEVER a literal address
- Warm, personal tone — NOT corporate or AI-sounding
- No em dashes

Return JSON: { "subject": "...", "body": "..." }`;

  const brandedPrompt = `${baseInfo}

Brand guidelines:
- Company: Top Tier Transitions
- Tagline: White Glove Senior Move Management. Done Right.
- Primary color: #2d4a3e (dark forest green)
- Accent: #4a7c5f
- Background: #f5f4f0 (warm off-white)
- Heading font: Georgia serif / Body font: Arial sans-serif
- Tone: Warm, premium, personal

Requirements:
- Full HTML document, inline CSS only (no <style> blocks)
- Header: #2d4a3e background, "Top Tier Transitions" white Georgia 24px bold, tagline in #a7c4b5 14px italic
- White content area, 32px padding, 600px max-width centered
- Open with "Hi {{first_name}}," then blank line
- 2-3 short paragraphs, specific to this resource
- Merge tags exactly: {{first_name}}, {{last_name}}, {{company}}, {{rep_first_name}}, {{rep_phone}}, {{rep_email}}
- Rep phone: whenever a phone number is referenced, write {{rep_phone}} — NEVER a literal number
- Rep email: whenever an email address is referenced, write {{rep_email}} — NEVER a literal address
- ${ctaLink ? `CTA button: <table align="center" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto"><tr><td align="center" bgcolor="#2d4a3e" style="border-radius:4px"><a href="${ctaLink}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-family:Georgia,serif;font-size:16px;font-weight:bold;text-decoration:none;border-radius:4px">View Resource</a></td></tr></table>` : "Mention resource is attached — no CTA button"}
- Warm sign-off from {{rep_first_name}} at Top Tier Transitions
- Footer: #f5f4f0 bg, 16px padding, center-aligned, gray 12px text, "Top Tier Transitions", then "{{rep_first_name}}" on the next line, then "{{rep_phone}}" on the next line, then "{{rep_email}}" on the next line
- No em dashes

Return JSON: { "subject": "...", "html": "..." }`;

  const userPrompt = isText ? textPrompt : brandedPrompt;

  type Block = Anthropic.Messages.ContentBlockParam;
  const blocks: Block[] = [];
  if (hasFile && item.fileUrl) {
    if (item.contentType === "PDF") {
      blocks.push({ type: "document", source: { type: "url", url: item.fileUrl } });
    } else {
      blocks.push({ type: "image", source: { type: "url", url: item.fileUrl } });
    }
  }
  blocks.push({ type: "text", text: userPrompt });

  let raw: string;
  try {
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: blocks.length > 1 ? blocks : userPrompt }],
    });
    raw = (resp.content[0] as { type: string; text: string }).text.trim();
  } catch {
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    raw = (resp.content[0] as { type: string; text: string }).text.trim();
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[compose-email] no JSON in response:", raw.slice(0, 300));
    return NextResponse.json({ error: "No JSON in Claude response" }, { status: 500 });
  }

  const parsed = JSON.parse(jsonMatch[0]) as { subject?: string; body?: string; html?: string };
  if (!parsed.subject) return NextResponse.json({ error: "Incomplete response from Claude" }, { status: 500 });

  return NextResponse.json({ subject: parsed.subject, body: parsed.body, html: parsed.html });
}
