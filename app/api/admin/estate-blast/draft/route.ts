import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface DraftRequest {
  brief: string;
  estateNames: string[];
  itemNames: string[];
}

export async function POST(request: Request): Promise<NextResponse> {
  const { userId } = await auth();
  const role = await getSystemRole(userId ?? "");
  if (role !== "TTTAdmin" && role !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: DraftRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { brief, estateNames = [], itemNames = [] } = body;

  if (!brief || typeof brief !== "string" || brief.trim().length === 0) {
    return NextResponse.json({ error: "brief is required" }, { status: 400 });
  }

  const estateContext =
    estateNames.length > 0
      ? `Featured estate sales: ${estateNames.join(", ")}`
      : "";
  const itemContext =
    itemNames.length > 0 ? `Featured items: ${itemNames.join(", ")}` : "";

  const prompt = `You are a luxury consignment and estate sale copywriter for ProFoundFinds, an upscale estate sale and consignment service.

Write a beautifully branded email for their shopper list.

Brief from the sender: ${brief}
${estateContext}
${itemContext}

Return ONLY a JSON object with no markdown:
{"subject": "...", "body": "..."}

The body should be 2-4 paragraphs of elegant, warm prose. No HTML tags — plain text paragraphs separated by double newlines. Tone: sophisticated, warm, inviting. Brand voice: like a knowledgeable friend who happens to have exquisite taste.`;

  let subject: string;
  let emailBody: string;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const raw =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Strip any accidental markdown code fences
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const parsed = JSON.parse(cleaned) as { subject: string; body: string };
    subject = parsed.subject;
    emailBody = parsed.body;
  } catch (err) {
    console.error("[estate-blast/draft] AI generation failed:", err);
    return NextResponse.json(
      { error: "Failed to generate draft. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ subject, body: emailBody });
}
