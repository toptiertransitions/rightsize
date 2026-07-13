import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { updateItem } from "@/lib/airtable";
import { isTTTAdmin } from "@/lib/config";
import type { QAFixField } from "@/lib/pf-qa";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface FixRequest {
  id: string;
  tenantId: string;
  itemName: string;
  category: string;
  condition: string;
  conditionNotes?: string;
  listingDescriptionEbay?: string;
  photoUrl?: string;
  fixFields: QAFixField[];
}

type FixResult = {
  id: string;
  originalName: string;
  updates: Partial<Record<QAFixField, string>>;
  error?: string;
};

async function fixItemWithAI(req: FixRequest): Promise<FixResult> {
  const { id, itemName, category, condition, conditionNotes, listingDescriptionEbay, photoUrl, fixFields } = req;

  const fieldDescriptions: Partial<Record<QAFixField, string>> = {
    itemName: 'A specific, descriptive product name (e.g. "Mid-Century Walnut Credenza" or "Vintage Cast Iron Skillet"). 5-10 words. No vague words like "item", "lot", "various".',
    conditionNotes: "1-3 sentences honestly describing visible condition — scratches, wear, damage, sturdiness. Be specific to what you see.",
    listingDescriptionEbay: "2-3 paragraphs covering style/era, notable features, and why a buyer would love this. Do NOT mention condition, dimensions, or shipping.",
  };

  const fieldsToGenerate = fixFields.map(f => `"${f}": ${fieldDescriptions[f] ?? ""}`).join("\n");

  const textContent = `You are a professional luxury consignment listing specialist for ProFoundFinds.com.

Item details:
- Current name: "${itemName}"
- Category: ${category}
- Condition: ${condition}
- Existing condition notes: ${conditionNotes?.trim() || "(none)"}
- Existing description: ${listingDescriptionEbay?.slice(0, 300).trim() || "(none)"}

${photoUrl ? "A photo of the item is attached. Examine it carefully before writing." : "No photo available — base your response on the provided details."}

Generate ONLY the following fields (return ONLY valid JSON, no markdown, no explanation):
{
${fieldsToGenerate}
}`;

  const content: Anthropic.MessageParam["content"] = photoUrl
    ? [
        { type: "image", source: { type: "url", url: photoUrl } },
        { type: "text", text: textContent },
      ]
    : textContent;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned) as Partial<Record<QAFixField, string>>;

  // Only keep requested fields that came back as non-empty strings
  const updates: Partial<Record<QAFixField, string>> = {};
  for (const field of fixFields) {
    const val = parsed[field];
    if (typeof val === "string" && val.trim()) {
      updates[field] = val.trim();
    }
  }

  return { id, originalName: itemName, updates };
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isTTTAdmin(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as FixRequest;
  const { id, tenantId, fixFields } = body;

  if (!id || !tenantId || !fixFields?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const result = await fixItemWithAI(body);

    if (Object.keys(result.updates).length > 0) {
      await updateItem(id, result.updates as Parameters<typeof updateItem>[1]);
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[pf-bulk-ai-fix] Item ${id} failed:`, error);
    return NextResponse.json({ ok: false, id, originalName: body.itemName, updates: {}, error }, { status: 500 });
  }
}
