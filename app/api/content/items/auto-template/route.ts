export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, createOutreachTemplate } from "@/lib/airtable";
import { getContentItemById } from "@/lib/airtable-content";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { itemId } = await req.json().catch(() => ({}));
  if (!itemId) return NextResponse.json({ error: "Missing itemId" }, { status: 400 });

  const item = await getContentItemById(itemId);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  if (item.audience !== "ReferralPartners") {
    return NextResponse.json({ skipped: true, reason: "Not referral partner content" });
  }

  const anthropic = new Anthropic();
  const isFile = ["PDF", "Image", "PartnerLogo", "Document"].includes(item.contentType);
  const ctaLink = item.linkUrl ?? "";
  const ctaLabel = isFile ? "Download Resource" : "View Resource";
  const hasFile = !!(item.fileUrl && ["PDF", "Image"].includes(item.contentType));

  const userPrompt = `Resource being shared: "${item.title}"
${item.description ? `Description: ${item.description}` : ""}
Content type: ${item.contentType}
Audience: Referral Partners (estate attorneys, senior living advisors, financial planners, social workers)
${ctaLink ? `CTA URL: ${ctaLink} — CTA label: "${ctaLabel}"` : "No external link — the resource will be attached directly to the email"}
${hasFile ? "The actual file is attached above. Read it carefully and weave in specific details, stats, visuals, or key points from the content so the email feels specific and valuable — not generic." : ""}

Generate a complete standalone HTML email from a TTT team member to a referral partner sharing this resource.

Brand guidelines:
- Company: Top Tier Transitions
- Tagline: White Glove Senior Move Management. Done Right.
- Primary color: #2d4a3e (dark forest green)
- Accent: #4a7c5f
- Background: #f5f4f0 (warm off-white)
- Heading font: Georgia serif
- Body font: Arial sans-serif
- Tone: Warm, premium, personal — NOT corporate or AI-sounding

Email requirements:
- Full HTML document with inline CSS only (no <style> blocks)
- Header: #2d4a3e background, "Top Tier Transitions" in white Georgia 24px bold, tagline in #a7c4b5 14px italic below
- White content area, 32px padding, 600px max-width centered
- Open with "Hi {{first_name}}," then a blank line
- Body: 2-3 short paragraphs. Be specific about what's in this resource and why it's valuable to their clients/referrals. Sound like a real person writing to a colleague.
- Keep merge tags exactly as-is: {{first_name}}, {{last_name}}, {{company}}, {{rep_first_name}}, {{rep_phone}}, {{rep_email}}
- Rep phone in body: whenever the email references a phone number to call or text, write {{rep_phone}} — NEVER write any literal phone number (no 312 numbers, no placeholders like [phone])
- Rep email in body: whenever the email references an email address to reply to or contact, write {{rep_email}} — NEVER write any literal email address (no info@, no placeholders like [email])
- ${ctaLink
    ? `CTA button: <table align="center" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto"><tr><td align="center" bgcolor="#2d4a3e" style="border-radius:4px"><a href="${ctaLink}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-family:Georgia,serif;font-size:16px;font-weight:bold;text-decoration:none;border-radius:4px">${ctaLabel}</a></td></tr></table>`
    : "Mention the resource is attached to this email — no CTA button needed"}
- Warm sign-off from {{rep_first_name}} at Top Tier Transitions
- Footer: #f5f4f0 bg, 16px padding, center-aligned, gray 12px text, "Top Tier Transitions", then "{{rep_first_name}}" on the next line, then "{{rep_phone}}" on the next line, then "{{rep_email}}" on the next line
- No em dashes anywhere in the email`;

  const systemPrompt = `You are an expert HTML email copywriter. You MUST respond with ONLY a single valid JSON object and absolutely nothing else — no explanation, no preamble, no markdown fences. The JSON must have exactly two keys: "subject" (string, 6 words max, specific and human) and "html" (string, the complete HTML email document).`;

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
  } catch (firstErr) {
    console.error("[auto-template] multimodal call failed, retrying text-only:", firstErr);
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
    console.error("[auto-template] no JSON in response:", raw.slice(0, 300));
    return NextResponse.json({ error: "No JSON in Claude response" }, { status: 500 });
  }

  const parsed = JSON.parse(jsonMatch[0]) as { subject: string; html: string };
  if (!parsed.subject || !parsed.html) {
    return NextResponse.json({ error: "Incomplete JSON from Claude" }, { status: 500 });
  }

  try {
    await createOutreachTemplate({
      name: item.title,
      channel: "Email",
      subject: parsed.subject,
      body: parsed.html,
      ownerClerkId: userId,
      shared: true,
      sharedWith: [],
      emailType: "branded",
      ctaLink,
      ctaLabel,
      attachmentUrl: item.fileUrl ?? "",
    });
  } catch (saveErr) {
    console.error("[auto-template] Airtable save failed:", saveErr);
    return NextResponse.json({ error: `Airtable save failed: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}` }, { status: 500 });
  }

  console.log(`[auto-template] template created for "${item.title}"`);
  return NextResponse.json({ success: true, templateName: item.title });
}
