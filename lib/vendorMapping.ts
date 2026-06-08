import Anthropic from "@anthropic-ai/sdk";
import type { Item, LocalVendor } from "./types";

export interface VendorAssignment {
  vendorId: string;
  vendorName: string;
  assignedItems: Array<{ itemId: string; rank: number; reasoning?: string }>;
}

const VENDOR_TYPE_FOR_ROUTE: Record<string, string> = {
  "Donate": "Donation Org",
  "Discard": "Junk Hauler",
};
function requiredVendorType(primaryRoute: string): string {
  return VENDOR_TYPE_FOR_ROUTE[primaryRoute] || "Consignment Store";
}

export function buildVendorMappingPrompt(
  projectZip: string,
  items: Array<{ itemId: string; itemName: string; category: string; primaryRoute: string; valueMid: number; condition: string }>,
  vendors: Array<{ vendorId: string; vendorName: string; vendorType: string; city: string; itemCategories: string; consignmentTake: number }>
): string {
  return `You are a vendor assignment system for a senior move management company. Assign each item to the best-fit vendor.

Hard routing rules (NEVER violate):
- Items with primaryRoute "Donate" must go to a vendor with vendorType "Donation Org"
- Items with primaryRoute "Discard" must go to a vendor with vendorType "Junk Hauler"
- All other items must go to a vendor with vendorType "Consignment Store"

Project zip code: ${projectZip}

Items to assign:
${JSON.stringify(items, null, 2)}

Available vendors:
${JSON.stringify(vendors, null, 2)}

Instructions:
1. Assign each item to the best vendor based on item category and vendor itemCategories
2. Batch items to the same vendor where possible (max 3 vendors total)
3. Return items in ranked order (rank 1 = best match for that vendor)
4. If an item cannot be matched to any eligible vendor, omit it
5. Return ONLY a compact JSON array — no prose, no markdown, no code fences

Return format (compact, no whitespace):
[{"vendorId":"recXXX","vendorName":"Village Thrift","assignedItems":[{"itemId":"recABC","rank":1}]}]`;
}

export function parseVendorMappingResponse(raw: string): VendorAssignment[] {
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function enforceRoutingConstraints(
  assignments: VendorAssignment[],
  items: Item[],
  vendors: LocalVendor[]
): VendorAssignment[] {
  const itemMap = new Map(items.map(i => [i.id, i]));
  const vendorMap = new Map(vendors.map(v => [v.id, v]));

  return assignments.map(va => {
    const vendor = vendorMap.get(va.vendorId);
    if (!vendor) return { ...va, assignedItems: [] };

    const validItems = va.assignedItems.filter(ai => {
      const item = itemMap.get(ai.itemId);
      if (!item) return false;
      const required = requiredVendorType(item.primaryRoute);
      return vendor.vendorType === required;
    });

    return { ...va, assignedItems: validItems };
  }).filter(va => va.assignedItems.length > 0);
}

export async function callVendorMappingAI(prompt: string): Promise<VendorAssignment[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
  return parseVendorMappingResponse(raw);
}
