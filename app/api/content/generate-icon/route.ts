import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import Anthropic from "@anthropic-ai/sdk";
import { v2 as cloudinary } from "cloudinary";

export const maxDuration = 60;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const AUDIENCE_CONTEXT: Record<string, string> = {
  Clients: "seniors and families navigating a home transition or downsizing move",
  ReferralPartners: "real estate agents, senior advisors, and referral partners",
  InternalTraining: "internal sales and operations staff",
  Both: "clients and referral partners in the senior living industry",
};

const TYPE_CONTEXT: Record<string, string> = {
  PDF: "a guide or document",
  Image: "a visual asset",
  Video: "a video",
  URL: "a web resource or article",
  LinkedIn: "a LinkedIn post",
};

function buildPrompt(title: string, description: string | undefined, contentType: string, audience: string): string {
  return `Generate a clean, minimal SVG icon for a piece of content with this context:

Title: "${title}"${description ? `\nDescription: "${description}"` : ""}
Content type: ${TYPE_CONTEXT[contentType] ?? contentType}
Audience: ${AUDIENCE_CONTEXT[audience] ?? audience}
Company: Top Tier Transitions — a premium senior downsizing and home transitions company

Design requirements:
- viewBox="0 0 200 200", width="200", height="200"
- Primary color: #2d4a3e (forest green)
- Accent / highlight color: #f5f0e8 (warm cream/ivory)
- Background: white (#ffffff) or very light (#f9f7f4)
- Flat minimalist geometric style — clean shapes, no gradients, no drop shadows
- No text, no letters, no numbers anywhere
- One or two simple shapes or symbols that clearly relate to the content topic
- Professional and polished — suitable for a luxury senior services brand
- High contrast so it reads clearly at 48×48px

Return ONLY the SVG markup. Start with <svg and end with </svg>. No explanation, no code fences, nothing else.`;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = buildPrompt(title.trim(), description?.trim(), contentType ?? "PDF", audience ?? "Both");

  const message = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText = message.content
    .filter(b => b.type === "text")
    .map(b => (b as { type: "text"; text: string }).text)
    .join("");

  // Extract SVG — Claude might wrap it despite instructions
  const svgMatch = rawText.match(/<svg[\s\S]*<\/svg>/i);
  const svgContent = svgMatch ? svgMatch[0] : rawText.trim();

  if (!svgContent.startsWith("<svg")) {
    return NextResponse.json({ error: "Could not generate a valid SVG" }, { status: 500 });
  }

  const svgBuffer = Buffer.from(svgContent, "utf-8");
  const dataUri = `data:image/svg+xml;base64,${svgBuffer.toString("base64")}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: "rightsize/content/icons",
    resource_type: "image",
  });

  return NextResponse.json({
    thumbnailUrl: result.secure_url,
    thumbnailPublicId: result.public_id,
  });
}
