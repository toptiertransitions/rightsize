export const runtime = "nodejs";
export const maxDuration = 30;

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
    after(async () => {
      try {
        const anthropic = new Anthropic();
        const isFile = ["PDF", "Video", "Image", "Document"].includes(item.contentType);
        const ctaLink = item.linkUrl ?? "";
        const ctaLabel = isFile ? "Download Resource" : "View Resource";

        const hasAttachment = item.fileUrl && ["PDF", "Image"].includes(item.contentType);
        const prompt = `You are a world-class HTML email designer for Top Tier Transitions — a premium estate liquidation and move management company.

Brand:
- Company: Top Tier Transitions
- Tagline: White Glove Senior Move Management. Done Right.
- Primary: #2d4a3e (dark forest green)
- Accent: #4a7c5f
- Background: #f5f4f0 (warm off-white)
- Font: Georgia serif for headings, Arial sans for body
- Tone: Warm, premium, human — NOT corporate AI

Resource being shared: "${item.title}"
${item.description ? `Description: ${item.description}` : ""}
Content type: ${item.contentType}
Audience: Referral Partners
${ctaLink ? `CTA label: "${ctaLabel}", URL: ${ctaLink}` : "No external link — resource will be attached to the email"}
${hasAttachment ? "IMPORTANT: The actual file (PDF/image) is attached above — read it carefully and reference specific details, statistics, visuals, or key takeaways from the content in the email body to make it compelling and specific, not generic." : ""}

Generate a complete standalone HTML email from a TTT team member to a referral partner sharing this resource. Requirements:
- Return ONLY valid JSON (no markdown fences): {"subject": "...", "html": "..."}
- Full HTML document with inline CSS only (no <style> blocks)
- Header: #2d4a3e background, "Top Tier Transitions" in white Georgia 24px bold, tagline "White Glove Senior Move Management. Done Right." in #a7c4b5 14px below
- White content area, 32px padding, 600px max-width centered
- Body starts with "Hi {{first_name}}," on its own line, then blank line
- Leave {{first_name}}, {{last_name}}, {{company}}, {{rep_first_name}} exactly as-is (merge tags)
- ${ctaLink ? `CTA button (email-safe): use a <table align="center" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto"><tr><td align="center" bgcolor="#2d4a3e" style="border-radius:4px;mso-padding-alt:0"><a href="${ctaLink}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-family:Georgia,serif;font-size:16px;font-weight:bold;text-decoration:none;border-radius:4px;-webkit-text-size-adjust:none">${ctaLabel}</a></td></tr></table>` : "No CTA button — mention the resource is attached"}
- Warm sign-off from {{rep_first_name}} at Top Tier Transitions in the footer
- Footer: #f5f4f0 bg, 16px padding, center-aligned gray 12px, "Top Tier Transitions"
- No em dashes anywhere
- Subject: short (6 words max), specific, human voice`;

        // Build content blocks — use URL references so the API fetches the file
        // directly rather than base64-encoding it in this serverless function
        type Block = Anthropic.Messages.ContentBlockParam;
        const blocks: Block[] = [];
        if (item.fileUrl && ["PDF", "Image"].includes(item.contentType)) {
          if (item.contentType === "PDF") {
            blocks.push({ type: "document", source: { type: "url", url: item.fileUrl } });
          } else {
            blocks.push({ type: "image", source: { type: "url", url: item.fileUrl } });
          }
        }
        blocks.push({ type: "text", text: prompt });

        // Try multimodal first; fall back to text-only if the model rejects the file block
        let message: Awaited<ReturnType<typeof anthropic.messages.create>>;
        if (blocks.length > 1) {
          try {
            message = await anthropic.messages.create({
              model: "claude-sonnet-4-6",
              max_tokens: 4000,
              messages: [{ role: "user", content: blocks }],
            });
          } catch (multimodalErr) {
            console.error("[content/items] multimodal call failed, falling back to text-only:", multimodalErr);
            message = await anthropic.messages.create({
              model: "claude-sonnet-4-6",
              max_tokens: 4000,
              messages: [{ role: "user", content: prompt }],
            });
          }
        } else {
          message = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 4000,
            messages: [{ role: "user", content: prompt }],
          });
        }

        const raw = (message.content[0] as { type: string; text: string }).text.trim();
        const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
        const parsed = JSON.parse(cleaned) as { subject: string; html: string };

        await createOutreachTemplate({
          name: item.title,
          channel: "Email",
          subject: parsed.subject || `New Resource: ${item.title}`,
          body: parsed.html,
          ownerClerkId: userId,
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
