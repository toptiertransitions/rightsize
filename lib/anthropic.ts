import Anthropic from "@anthropic-ai/sdk";
import type { ItemAnalysis } from "./types";
import { ALL_CATEGORIES, CATEGORY_AI_HINT, isValidCategory } from "./categories";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANALYSIS_PROMPT = `You are an expert estate sale appraiser and senior downsizing specialist.
Analyze the photo of this household item and return a JSON object. The example below shows the exact field names and data types — replace every value with your real assessment of the item in the photo:

{
  "item_name": "Victorian Walnut Side Chair",
  "category": "Seating",
  "is_antique": true,
  "condition": "Good",
  "condition_notes": "Minor surface scratches on left arm; sturdy joints",
  "size_class": "Fits in Car-SUV",
  "fragility": "Somewhat Fragile",
  "item_type": "Collector Item",
  "value_low": 75,
  "value_mid": 125,
  "value_high": 200,
  "primary_route": "ProFoundFinds Consignment",
  "route_reasoning": "Well-made antique piece with strong resale value at a consignment shop.",
  "consignment_category": "Victorian Walnut Furniture",
  "listing_title_ebay": "Antique Victorian Walnut Side Chair Carved Detail c.1880",
  "listing_description_ebay": "This elegant Victorian walnut side chair showcases the refined craftsmanship of the late 19th century. The carved back splat and turned legs reflect the period's attention to decorative detail.\n\nA timeless addition to any traditional or eclectic interior, this piece pairs well with formal dining sets or as a statement accent chair.",
  "listing_fb": "Beautiful antique Victorian walnut chair, solid and sturdy. Perfect for a reading nook or as a decorative accent. $125 firm, local pickup only.",
  "listing_offerup": "Antique Victorian walnut side chair, great condition, priced to sell at $125.",
  "staff_tips": "Photograph from multiple angles to showcase the carved back detail. Wipe with a lightly oiled cloth before shooting."
}

Field rules:
- item_name: short descriptive name, under 10 words
- category: MUST be verbatim from the 26-value list below
- is_antique: boolean true/false — true if item appears 50+ years old or has clear period styling
- condition: MUST be exactly one of: Excellent | Good | Fair | Poor | For Parts
- condition_notes: brief honest description of visible wear or damage
- size_class: MUST be exactly one of: Small & Shippable | Fits in Car-SUV | Needs Movers
- fragility: MUST be exactly one of: Not Fragile | Somewhat Fragile | Very Fragile
- item_type: MUST be exactly one of: Daily Use | Collector Item
- value_low: integer USD — low-end estimate based on condition and current market (NEVER null or a string)
- value_mid: integer USD — realistic selling price (NEVER null or a string)
- value_high: integer USD — best-case price for a patient seller (NEVER null or a string)
- primary_route: MUST be exactly one of: To Be Moved | Family to Take | Storage Unit - Offsite | Leaving with Home | ProFoundFinds Consignment | FB/Marketplace | Online Marketplace | Other Consignment | Donate | Discard
- route_reasoning: 1-2 sentences explaining why this route is best
- consignment_category: best shop sub-category if consignment-worthy (e.g., "Victorian Walnut Furniture"), else empty string
- listing_title_ebay: SEO-optimized eBay title under 80 chars with key details
- listing_description_ebay: 2-3 paragraphs on provenance/history, style, and notable features. Do NOT include condition, dimensions, or shipping guidance.
- listing_fb: short casual Facebook Marketplace post (2-3 sentences)
- listing_offerup: short OfferUp listing (1-2 sentences, price-focused)
- staff_tips: practical handling or listing tip for the TTT helper

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
    max_tokens: 3000,
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
