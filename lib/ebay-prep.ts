// AI-assisted gap filling right before an item goes to eBay (List It, bulk
// List Online, Edit Listing). Server-only.
//
// eBay rejects a listing when:
//  - the description is empty,
//  - a required item specific for the category is missing or not one of the
//    allowed values (e.g. "Number of Drawers", "Brand"),
//  - the condition isn't allowed in that category (e.g. "Used - Good" in
//    Vases).
// So before publishing we ask eBay what the category requires and allows,
// pick the closest allowed condition, and have Claude fill only what's
// missing from the item's own details and photos. Anything the AI can't
// fill confidently is left out, and eBay's message explains what's needed.
import Anthropic from "@anthropic-ai/sdk";
import type { Item } from "@/lib/types";

type GetJson = (url: string) => Promise<unknown | null>;

interface AspectMeta {
  name: string;
  required: boolean;
  selectionOnly: boolean;
  values: string[];
}

const aspectCache = new Map<string, AspectMeta[]>();
const conditionCache = new Map<string, number[]>();

async function categoryAspects(categoryId: string, getJson: GetJson): Promise<AspectMeta[]> {
  if (aspectCache.has(categoryId)) return aspectCache.get(categoryId)!;
  const data = await getJson(
    `https://api.ebay.com/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category?category_id=${encodeURIComponent(categoryId)}`
  ) as { aspects?: { localizedAspectName: string; aspectConstraint?: { aspectRequired?: boolean; aspectMode?: string }; aspectValues?: { localizedValue: string }[] }[] } | null;
  const list: AspectMeta[] = (data?.aspects ?? []).map((a) => ({
    name: a.localizedAspectName,
    required: a.aspectConstraint?.aspectRequired === true,
    selectionOnly: a.aspectConstraint?.aspectMode === "SELECTION_ONLY",
    values: (a.aspectValues ?? []).map((v) => v.localizedValue),
  }));
  if (data) aspectCache.set(categoryId, list);
  return list;
}

async function allowedConditionIds(categoryId: string, getJson: GetJson): Promise<number[]> {
  if (conditionCache.has(categoryId)) return conditionCache.get(categoryId)!;
  const data = await getJson(
    `https://api.ebay.com/sell/metadata/v1/marketplace/EBAY_US/get_item_condition_policies?filter=${encodeURIComponent(`categoryIds:{${categoryId}}`)}`
  ) as { itemConditionPolicies?: { itemConditions?: { conditionId: string }[] }[] } | null;
  const ids = (data?.itemConditionPolicies?.[0]?.itemConditions ?? []).map((c) => Number(c.conditionId)).filter((n) => n > 0);
  if (data) conditionCache.set(categoryId, ids);
  return ids;
}

// Inventory API condition enums <-> eBay condition ids
const CONDITION_IDS: Record<string, number> = {
  NEW: 1000, NEW_OTHER: 1500, NEW_WITH_DEFECTS: 1750, CERTIFIED_REFURBISHED: 2000, SELLER_REFURBISHED: 2500,
  LIKE_NEW: 2750, USED_EXCELLENT: 3000, USED_VERY_GOOD: 4000, USED_GOOD: 5000, USED_ACCEPTABLE: 6000,
  FOR_PARTS_OR_NOT_WORKING: 7000,
};
const ID_TO_CONDITION = Object.fromEntries(Object.entries(CONDITION_IDS).map(([k, v]) => [v, k])) as Record<number, string>;

/** The allowed condition closest to what we'd like, staying on the used side. */
function closestAllowedCondition(wanted: string, allowed: number[]): string {
  const want = CONDITION_IDS[wanted];
  if (!want || allowed.length === 0 || allowed.includes(want)) return wanted;
  const used = allowed.filter((id) => id >= 2750 && ID_TO_CONDITION[id]);
  const pool = used.length > 0 ? used : allowed.filter((id) => ID_TO_CONDITION[id]);
  if (pool.length === 0) return wanted;
  const best = pool.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
  return ID_TO_CONDITION[best];
}

function matchValue(value: string, allowed: string[]): string | null {
  const v = value.trim().toLowerCase();
  return allowed.find((a) => a.toLowerCase() === v) ?? null;
}

/** Smaller Cloudinary rendition for the AI to look at */
function smallImage(url: string): string {
  return url.includes("res.cloudinary.com") && url.includes("/upload/") ? url.replace("/upload/", "/upload/c_limit,w_900/") : url;
}

export interface EbayPrepResult {
  condition: string;
  /** Item specifics to add or replace */
  aspects: Record<string, string[]>;
  /** Set when the description was empty and AI wrote one */
  generatedDescription?: string;
  notes: string[];
}

export async function prepareEbayListing(params: {
  item: Item;
  categoryId: string;
  condition: string;
  aspects: Record<string, string[]>;
  getJson: GetJson;
}): Promise<EbayPrepResult> {
  const { item, categoryId, getJson } = params;
  const notes: string[] = [];

  const [aspectMeta, conditionIds] = await Promise.all([
    categoryAspects(categoryId, getJson).catch(() => [] as AspectMeta[]),
    allowedConditionIds(categoryId, getJson).catch(() => [] as number[]),
  ]);

  const condition = closestAllowedCondition(params.condition, conditionIds);
  if (condition !== params.condition) notes.push(`condition ${params.condition} -> ${condition} (category allows ${conditionIds.join(",")})`);

  // Required specifics that are missing, or not an allowed value
  const missing = aspectMeta.filter((m) => {
    if (!m.required) return false;
    const current = params.aspects[m.name]?.[0];
    if (!current || !current.trim()) return true;
    return m.selectionOnly && m.values.length > 0 && !matchValue(current, m.values);
  });
  const needsDescription = !(item.listingDescriptionEbay ?? "").trim();
  if (missing.length === 0 && !needsDescription) return { condition, aspects: {}, notes };

  const photoUrls = [...(item.photos ?? []).map((p) => p.url), ...(item.photoUrl ? [item.photoUrl] : [])]
    .filter((u): u is string => !!u && u.startsWith("https://")).slice(0, 2);

  const facts = [
    `Title: ${item.itemName || item.listingTitleEbay || ""}`,
    item.listingTitleEbay && item.listingTitleEbay !== item.itemName ? `eBay title: ${item.listingTitleEbay}` : null,
    item.category ? `Category: ${item.category}` : null,
    item.brand ? `Brand: ${item.brand}` : null,
    item.condition ? `Condition: ${item.condition}` : null,
    item.conditionNotes ? `Condition notes: ${item.conditionNotes}` : null,
    item.widthInches || item.heightInches || item.depthInches
      ? `Dimensions (in.): W ${item.widthInches ?? "?"} x H ${item.heightInches ?? "?"} x D ${item.depthInches ?? "?"}` : null,
    item.quantity && item.quantity > 1 ? `Quantity: ${item.quantity}` : null,
    item.listingDescriptionEbay ? `Description: ${item.listingDescriptionEbay.slice(0, 1500)}` : null,
    item.listingFb ? `Other listing text: ${item.listingFb.slice(0, 800)}` : null,
  ].filter(Boolean).join("\n");

  const aspectLines = missing.map((m) => {
    const opts = m.selectionOnly && m.values.length > 0
      ? ` (choose exactly one of: ${m.values.slice(0, 80).join(" | ")})`
      : m.values.length > 0 ? ` (examples: ${m.values.slice(0, 15).join(" | ")})` : "";
    return `- ${m.name}${opts}`;
  }).join("\n");

  const prompt = `You prepare eBay listings for ProFound Finds, an estate sale and consignment shop. Fill in only what's missing, using the item details${photoUrls.length ? " and photos" : ""}.

ITEM
${facts}

${needsDescription ? `DESCRIPTION: The listing has no description. Write one: 2 to 4 short, factual paragraphs a buyer can trust (what it is, notable features, materials, style, condition). Mention the dimensions if given; if they aren't, say nothing about size or measurements. Don't invent brands, makers, dates or measurements you can't see or aren't told, and never point out what information is missing. Only describe what is clearly visible: if you aren't sure what a piece depicts or what shape it is, describe it plainly by material, color and finish instead of guessing. The item title is reliable; trust it over your own impression. Don't tell the buyer to review the photos. No emojis, no ALL CAPS, no em dashes.\n` : ""}${missing.length ? `ITEM SPECIFICS eBay requires for this category:\n${aspectLines}\nFor each, give the best value. When a list of choices is given, use one of them exactly. If the brand or maker isn't known, use "Unbranded" (or "Unknown" if that's a choice). For counts you can see in the photos (like drawers), count them. Keep each value under 65 characters.\n` : ""}`;

  const content: Anthropic.ContentBlockParam[] = [
    ...photoUrls.map((u) => ({ type: "image" as const, source: { type: "url" as const, url: smallImage(u) } })),
    { type: "text", text: prompt },
  ];

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let parsed: { description?: string; aspects?: { name: string; value: string }[] } = {};
  try {
    const msg = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 4000,
      output_config: {
        effort: "medium",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["description", "aspects"],
            properties: {
              description: { type: "string", description: needsDescription ? "The new description" : "Leave empty" },
              aspects: {
                type: "array",
                items: { type: "object", additionalProperties: false, required: ["name", "value"], properties: { name: { type: "string" }, value: { type: "string" } } },
              },
            },
          },
        },
      },
      messages: [{ role: "user", content }],
    });
    const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "{}";
    parsed = JSON.parse(text);
  } catch (e) {
    console.error("[ebay-prep] AI fill failed:", e);
    notes.push("AI fill failed");
  }

  const aspects: Record<string, string[]> = {};
  for (const m of missing) {
    const raw = parsed.aspects?.find((a) => a.name.trim().toLowerCase() === m.name.toLowerCase())?.value?.trim() ?? "";
    let value: string | null = null;
    if (m.selectionOnly && m.values.length > 0) {
      value = (raw && matchValue(raw, m.values))
        ?? matchValue("Unbranded", m.values) ?? matchValue("Unknown", m.values) ?? matchValue("Does Not Apply", m.values);
    } else {
      value = raw ? raw.slice(0, 65) : (/brand/i.test(m.name) ? "Unbranded" : null);
    }
    if (value) aspects[m.name] = [value];
    else notes.push(`no value for ${m.name}`);
  }
  if (Object.keys(aspects).length) notes.push(`filled ${Object.entries(aspects).map(([k, v]) => `${k}=${v[0]}`).join(", ")}`);

  const generatedDescription = needsDescription && parsed.description?.trim() ? parsed.description.trim() : undefined;
  if (generatedDescription) notes.push("wrote description");
  return { condition, aspects, generatedDescription, notes };
}
