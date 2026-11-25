// Validation for create / update payloads, shared by the drawer and the API.
import { z } from "zod";
import {
  COI_OPTIONS, COMMUNITY_STATUSES, COMMUNITY_TYPES, CONTACT_ROLES, PHONE_LABELS, RULE_KEYS, RULE_STATUSES, type RuleKey,
} from "./types";

const text = (max: number) => z.string().trim().max(max);
const ruleKey = z.enum(RULE_KEYS as [RuleKey, ...RuleKey[]]);

export const communityFieldsSchema = z.object({
  name: text(200).min(1, "Name is required"),
  type: z.enum(COMMUNITY_TYPES),
  operator: text(200),
  street: text(300),
  city: text(120),
  state: text(40),
  zip: text(20),
  website: z.union([z.literal(""), z.string().trim().url("Enter a full web address, like https://example.com").max(500)]),
  linkedCompanyId: z.union([z.literal(""), z.string().regex(/^rec[A-Za-z0-9]{14}$/, "Not a record ID")]),
  status: z.enum(COMMUNITY_STATUSES),
  rules: z.partialRecord(ruleKey, text(5000)),
  ruleStatus: z.partialRecord(ruleKey, z.enum(RULE_STATUSES)),
  floorPlansOnFile: z.boolean(),
  floorPlansNotes: text(5000),
  openItems: text(5000),
  sourceNotes: text(5000),
  lastVerified: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  lastVerifiedBy: text(200),
  internalNotes: text(10000),
});

export const createCommunitySchema = communityFieldsSchema
  .partial()
  .extend({ name: communityFieldsSchema.shape.name, type: communityFieldsSchema.shape.type });

export const updateCommunitySchema = communityFieldsSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const coiSchema = z.enum(COI_OPTIONS);

export const phoneSchema = z.object({ label: z.enum(PHONE_LABELS), number: text(60).min(1, "Enter a number") });

export const contactFieldsSchema = z.object({
  name: text(200).min(1, "Name is required"),
  title: text(200),
  role: z.union([z.literal(""), z.enum(CONTACT_ROLES)]),
  email: z.union([z.literal(""), z.string().trim().email("Check the email address").max(320)]),
  phones: z.array(phoneSchema).max(10),
  isPrimaryMoveIn: z.boolean(),
  notes: text(5000),
  linkedContactId: z.union([z.literal(""), z.string().regex(/^rec[A-Za-z0-9]{14}$/, "Not a record ID")]),
  sortOrder: z.number().int().min(0).max(100000),
});

export const createContactSchema = contactFieldsSchema.partial().extend({ name: contactFieldsSchema.shape.name });
export const updateContactSchema = contactFieldsSchema.partial();
export const reorderContactsSchema = z.object({ order: z.array(z.string().regex(/^rec[A-Za-z0-9]{14}$/)).min(1).max(200) });

export type CommunityFields = z.infer<typeof communityFieldsSchema>;
export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
export type UpdateCommunityInput = z.infer<typeof updateCommunitySchema>;
export type ContactFields = z.infer<typeof contactFieldsSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

/** First error message per field, for inline display. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
