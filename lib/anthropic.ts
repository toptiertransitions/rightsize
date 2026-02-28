import Anthropic from "@anthropic-ai/sdk";
import type { ItemAnalysis } from "./types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANALYSIS_PROMPT = `You are an expert estate sale appraiser and senior downsizing specialist.
Analyze the photo of this household item and return a JSON object with EXACTLY these fields:

{
  "item_name": "Short descriptive name (e.g., 'Vintage Oak Rocking Chair')",
  "category": "Category (e.g., 'Furniture', 'Art & Collectibles', 'Electronics', 'Kitchen & Dining', 'Books & Media', 'Clothing & Accessories', 'Tools & Hardware', 'Sports & Outdoors', 'Décor & Accessories', 'Other')",
  "condition": "One of: Excellent | Good | Fair | Poor | For Parts",
  "condition_notes": "Brief honest description of condition, visible wear, damage",
  "size_class": "One of: Small & Shippable | Fits in Car-SUV | Needs Movers",
  "fragility": "One of: Not Fragile | Somewhat Fragile | Very Fragile",
  "item_type": "One of: Daily Use | Collector Item",
  "value_low": number (USD, low estimate for condition/market),
  "value_mid": number (USD, realistic selling price),
  "value_high": number (USD, best-case if patient seller),
  "primary_route": "One of: Online Marketplace | Local Consignment | Donate | Discard",
  "route_reasoning": "1-2 sentences explaining why this route is best",
  "consignment_category": "If consignment-worthy, the best shop category (e.g., 'Antique Furniture', 'Vintage Jewelry'), else empty string",
  "listing_title_ebay": "SEO-optimized eBay title under 80 chars with key details",
  "listing_description_ebay": "2-3 paragraph eBay description — condition, dimensions if visible, history, shipping notes",
  "listing_fb": "Short casual Facebook Marketplace post (2-3 sentences)",
  "listing_offerup": "Short OfferUp listing (1-2 sentences, price-focused)",
  "staff_tips": "Practical tip for the TTT helper — how to handle, photograph better, where to list, watch-outs"
}

Return ONLY valid JSON with no markdown, no explanation, no code fences.`;

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

  return analysis;
}
