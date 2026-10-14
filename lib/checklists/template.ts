// Editing a community's checklist (the list of tasks). Callers check who's
// allowed first: TTT admins in Tenant Config, or the community's account
// owner in the partner portal. Server-only.
import "server-only";
import { z } from "zod";
import { archiveChecklistItem, createChecklistItem, getChecklistItemById, getChecklistItems, setChecklistOrder, updateChecklistItem } from "./data";
import type { ChecklistItem } from "./shared";

export const itemInputSchema = z.object({
  id: z.string().regex(/^rec[A-Za-z0-9]{14}$/).optional(),
  title: z.string().trim().min(1, "Give the task a name").max(160),
  details: z.string().trim().max(2000).default(""),
  dueType: z.enum(["none", "before", "after", "date"]),
  dueDays: z.number().int().min(0).max(730).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine((v) => v.dueType !== "date" || !!v.dueDate, { message: "Pick the due date", path: ["dueDate"] });

export type ItemInput = z.input<typeof itemInputSchema>;

export async function saveChecklistItem(brandId: string, raw: ItemInput, actorName: string): Promise<ChecklistItem[]> {
  const input = itemInputSchema.parse(raw);
  const data = { title: input.title, details: input.details, dueType: input.dueType, dueDays: input.dueDays, dueDate: input.dueDate };
  if (input.id) {
    const existing = await getChecklistItemById(input.id);
    if (!existing || existing.brandId !== brandId || existing.archived) throw new Error("That task wasn't found.");
    await updateChecklistItem(input.id, data, actorName);
  } else {
    const items = await getChecklistItems([brandId]);
    const next = (items[items.length - 1]?.sortOrder ?? 0) + 10;
    await createChecklistItem(brandId, data, next, actorName);
  }
  return getChecklistItems([brandId]);
}

export async function removeChecklistItem(brandId: string, itemId: string, actorName: string): Promise<ChecklistItem[]> {
  const existing = await getChecklistItemById(itemId);
  if (!existing || existing.brandId !== brandId) throw new Error("That task wasn't found.");
  await archiveChecklistItem(itemId, actorName);
  return getChecklistItems([brandId]);
}

export async function reorderChecklist(brandId: string, orderedIds: string[]): Promise<ChecklistItem[]> {
  const items = await getChecklistItems([brandId]);
  const known = new Set(items.map((i) => i.id));
  const ids = orderedIds.filter((id) => known.has(id));
  if (ids.length !== items.length) throw new Error("The list changed. Refresh and try again.");
  await setChecklistOrder(ids);
  return getChecklistItems([brandId]);
}
