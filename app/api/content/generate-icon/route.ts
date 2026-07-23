import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { uploadPng } from "@/lib/cloudinary";
import OpenAI from "openai";

export const maxDuration = 60;

function buildPrompt(title: string, description: string | undefined, contentType: string, audience: string): string {
  const audienceContext: Record<string, string> = {
    Clients: "seniors and families navigating a home transition or downsizing move",
    ReferralPartners: "real estate agents, senior advisors, and referral partners in the senior living industry",
    InternalTraining: "internal sales and operations staff at a senior transitions company",
    Both: "clients and referral partners in the senior living and downsizing industry",
  };

  const typeContext: Record<string, string> = {
    PDF: "a PDF guide or document",
    Image: "an image or visual asset",
    Video: "a video resource",
    URL: "a web resource or article",
    LinkedIn: "a LinkedIn social media post",
  };

  const lines = [
    `Design a clean, professional flat icon for a content piece titled: "${title}".`,
    description ? `The content is about: ${description}.` : "",
    `It is ${typeContext[contentType] ?? "a content piece"} intended for ${audienceContext[audience] ?? "a professional audience"}.`,
    `The company is Top Tier Transitions — a premium senior downsizing and home transition company.`,
    ``,
    `Icon design requirements:`,
    `- Flat minimalist illustration style, not photorealistic`,
    `- Primary color: forest green (#2d4a3e) with warm cream/ivory accents (#f5f0e8)`,
    `- White or very light background`,
    `- Simple bold shapes — one or two central elements that represent the topic`,
    `- No text, no letters, no numbers`,
    `- Square format, centered composition`,
    `- Professional, premium, clean — suitable for a luxury senior services brand`,
    `- High contrast, easy to read at small sizes`,
  ].filter(Boolean).join("\n");

  return lines;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { title, description, contentType, audience } = body as {
    title?: string;
    description?: string;
    contentType?: string;
    audience?: string;
  };

  if (!title?.trim()) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = buildPrompt(title.trim(), description?.trim(), contentType ?? "PDF", audience ?? "Both");

  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt,
    n: 1,
    size: "1024x1024",
    quality: "standard",
    response_format: "b64_json",
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    return NextResponse.json({ error: "No image returned from DALL-E" }, { status: 500 });
  }

  const buffer = Buffer.from(b64, "base64");
  const result = await uploadPng(buffer, { tenantId: "content/icons" });

  return NextResponse.json({ thumbnailUrl: result.secureUrl, thumbnailPublicId: result.publicId });
}
