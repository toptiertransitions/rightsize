import Anthropic from "@anthropic-ai/sdk";
import type { ItemAnalysis } from "./types";
import { ALL_CATEGORIES, CATEGORY_AI_HINT, isValidCategory } from "./categories";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANALYSIS_PROMPT = `You are an expert estate sale appraiser and senior downsizing specialist.
Analyze the photo of this household item and return a JSON object with EXACTLY these fields:

{
  "item_name": "Short descriptive name (e.g., 'Victorian Walnut Side Chair')",
  "category": "<see category rules below — must be verbatim from the 26-value list>",
  "is_antique": true or false (true if the item appears to be antique or vintage, i.e. likely 50+ years old or with clear period styling — this is an attribute, not a category),
  "condition": "One of: Excellent | Good | Fair | Poor | For Parts",
  "condition_notes": "Brief honest description of condition, visible wear, damage",
  "size_class": "One of: Small & Shippable | Fits in Car-SUV | Needs Movers",
  "fragility": "One of: Not Fragile | Somewhat Fragile | Very Fragile",
  "item_type": "One of: Daily Use | Collector Item",
  "value_low": number (USD, low estimate for condition/market),
  "value_mid": number (USD, realistic selling price),
  "value_high": number (USD, best-case if patient seller),
  "primary_route": "One of: To Be Moved | Family to Take | Storage Unit - Offsite | Leaving with Home | ProFoundFinds Consignment | FB/Marketplace | Online Marketplace | Other Consignment | Donate | Discard",
  "route_reasoning": "1-2 sentences explaining why this route is best",
  "consignment_category": "If consignment-worthy, the best shop sub-category description (e.g., 'Victorian Walnut Furniture', 'Art Deco Jewelry'), else empty string",
  "listing_title_ebay": "SEO-optimized eBay title under 80 chars with key details",
  "listing_description_ebay": "2-3 paragraph description focused on provenance/history, style, notable features, and why a buyer would want this item. Do NOT include condition or condition notes (captured separately). Do NOT include dimensions or measurements (captured separately). Do NOT include shipping instructions or packaging guidance.",
  "listing_fb": "Short casual Facebook Marketplace post (2-3 sentences)",
  "listing_offerup": "Short OfferUp listing (1-2 sentences, price-focused)",
  "staff_tips": "Practical tip for the TTT helper — how to handle, photograph better, where to list, watch-outs"
}

${CATEGORY_AI_HINT}

Return ONLY valid JSON with no markdown, no explanation, no code fences.`;

export interface MoverGroup {
  category: string;
  count: number;
}

// Groups a flat list of item names into mover-friendly categories for a quote summary.
// Uses Haiku for speed. Falls back gracefully — caller should catch.
export async function groupItemsForMovers(itemNames: string[]): Promise<MoverGroup[]> {
  if (itemNames.length === 0) return [];

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are a moving company estimator reviewing a household item list to prepare a quote.

Group these ${itemNames.length} items into practical moving categories. Combine semantically similar items (e.g. "King Bed", "Queen Bed", "Twin Bed Frame" → "Beds"). Use clear, mover-friendly names like "Beds", "Sofas & Seating", "Dressers", "Dining Chairs", "Tables", "Lamps", "Rugs", "Artwork & Mirrors", "Boxes & Totes", etc. Every item must be counted exactly once. Sort by count descending, then category name A–Z.

Items (${itemNames.length} total, one per line):
${itemNames.join("\n")}

Return ONLY a valid JSON array with no markdown, explanation, or code fences:
[{"category":"Beds","count":3},{"category":"Sofas & Seating","count":2}]`,
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned) as MoverGroup[];
  return parsed.filter(g => typeof g.category === "string" && g.count > 0);
}

export async function analyzeItemPhoto(
  imageData: string | { url: string },
  mimeType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg"
): Promise<ItemAnalysis> {
  const imageSource =
    typeof imageData === "string"
      ? {
          type: "base64" as const,
          media_type: mimeType,
          data: imageData,
        }
      : { type: "url" as const, url: imageData.url };

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: imageSource,
          },
          {
            type: "text",
            text: ANALYSIS_PROMPT,
          },
        ],
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  // Strip any accidental markdown fences
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let analysis: ItemAnalysis;
  try {
    analysis = JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude returned invalid JSON: ${text.slice(0, 200)}`);
  }

  // Coerce category to a valid value — never let a bad string reach the DB.
  if (!isValidCategory(analysis.category)) {
    const fallback = ALL_CATEGORIES.find(c =>
      c.toLowerCase().includes(analysis.category.toLowerCase()) ||
      analysis.category.toLowerCase().includes(c.toLowerCase())
    ) ?? "Other";
    console.warn(`[analyzeItemPhoto] AI returned unknown category "${analysis.category}", coerced to "${fallback}"`);
    analysis = { ...analysis, category: fallback };
  }

  return analysis;
}
