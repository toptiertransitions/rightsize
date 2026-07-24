export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, createOutreachTemplate } from "@/lib/airtable";
import { getContentItems, createContentItem } from "@/lib/airtable-content";
import type { ContentItemType, ContentAudience, ContentPipelineStage, ContentStatus } from "@/lib/types";
import Anthropic from "@anthropic-ai/sdk";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const status = (searchParams.get("status") as ContentStatus | null) ?? undefined;
  const audience = (searchParams.get("audience") as ContentAudience | null) ?? undefined;
  const pipelineStage = (searchParams.get("pipelineStage") as ContentPipelineStage | null) ?? undefined;
  const categoryId = searchParams.get("categoryId") ?? undefined;
  const scheduledDateFrom = searchParams.get("from") ?? undefined;
  const scheduledDateTo = searchParams.get("to") ?? undefined;

  const items = await getContentItems({ status, audience, pipelineStage, categoryId, scheduledDateFrom, scheduledDateTo });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.title || !body?.contentType || !body?.audience || !body?.pipelineStage) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const item = await createContentItem({
    title: body.title,
    description: body.description,
    contentType: body.contentType as ContentItemType,
    fileUrl: body.fileUrl,
    filePublicId: body.filePublicId,
    linkUrl: body.linkUrl,
    thumbnailUrl: body.thumbnailUrl,
    thumbnailPublicId: body.thumbnailPublicId,
    audience: body.audience as ContentAudience,
    pipelineStage: body.pipelineStage as ContentPipelineStage,
    categoryId: body.categoryId,
    tags: body.tags ?? [],
    authorClerkId: userId,
    status: body.status ?? "Active",
    scheduledDate: body.scheduledDate,
  });

  // Fire-and-forget: auto-generate a branded email template for referral partner content
  if (item.audience === "ReferralPartners") {
    const capturedUserId = userId; // explicit capture for closure
    after(async () => {
      try {
        const anthropic = new Anthropic();
        const isFile = ["PDF", "Video", "Image", "Document"].includes(item.contentType);
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
- Keep merge tags exactly as-is: {{first_name}}, {{last_name}}, {{company}}, {{rep_first_name}}
- ${ctaLink
    ? `CTA button: <table align="center" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto"><tr><td align="center" bgcolor="#2d4a3e" style="border-radius:4px"><a href="${ctaLink}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-family:Georgia,serif;font-size:16px;font-weight:bold;text-decoration:none;border-radius:4px">${ctaLabel}</a></td></tr></table>`
    : "Mention the resource is attached to this email — no CTA button needed"}
- Warm sign-off from {{rep_first_name}} at Top Tier Transitions
- Footer: #f5f4f0 bg, 16px padding, center-aligned, gray 12px, "Top Tier Transitions"
- No em dashes anywhere in the email`;

        // Build content blocks — attach file via URL when available
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

        const systemPrompt = `You are an expert HTML email copywriter. You MUST respond with ONLY a single valid JSON object and absolutely nothing else — no explanation, no preamble, no markdown. The JSON must have exactly two keys: "subject" (string, 6 words max, specific and human) and "html" (string, the complete HTML email document).`;

        // Try multimodal (with file) first; fall back to text-only on failure
        let raw: string;
        try {
          const useBlocks = blocks.length > 1;
          const resp = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: "user", content: useBlocks ? blocks : userPrompt }],
          });
          raw = (resp.content[0] as { type: string; text: string }).text.trim();
        } catch (firstErr) {
          console.error("[content/items] first Claude call failed, retrying text-only:", firstErr);
          const resp = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
          });
          raw = (resp.content[0] as { type: string; text: string }).text.trim();
        }

        // Extract JSON — handle any preamble or markdown fences Sonnet might add
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error(`No JSON object found in response: ${raw.slice(0, 200)}`);
        const parsed = JSON.parse(jsonMatch[0]) as { subject: string; html: string };

        if (!parsed.subject || !parsed.html) {
          throw new Error(`Incomplete JSON: ${JSON.stringify(parsed).slice(0, 200)}`);
        }

        await createOutreachTemplate({
          name: item.title,
          channel: "Email",
          subject: parsed.subject,
          body: parsed.html,
          ownerClerkId: capturedUserId,
          shared: true,
          emailType: "branded",
          ctaLink,
          ctaLabel,
          attachmentUrl: item.fileUrl ?? "",
        });
        console.log(`[content/items] auto-template created for "${item.title}"`);
      } catch (err) {
        console.error("[content/items] auto-template generation failed:", err);
      }
    });
  }

  return NextResponse.json({ item });
}
