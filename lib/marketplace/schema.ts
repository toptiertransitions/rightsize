// Zod schema generated from a Category's fieldSchema, so the same validation
// runs on both client (form submission) and server (listing write) without
// hand-writing a schema per category.
import { z } from "zod";
import type { MarketplaceFieldDef } from "./types";

function zodForField(field: MarketplaceFieldDef): z.ZodTypeAny {
  let schema: z.ZodTypeAny;
  switch (field.type) {
    case "number":
    case "currency":
    case "range":
      schema = z.number();
      break;
    case "boolean":
      schema = z.boolean();
      break;
    case "multiselect":
      schema = field.options
        ? z.array(z.enum(field.options as [string, ...string[]]))
        : z.array(z.string());
      break;
    case "select":
      schema = field.options ? z.enum(field.options as [string, ...string[]]) : z.string();
      break;
    case "url":
      schema = z.string().url();
      break;
    case "text":
    case "longtext":
    case "file":
    default:
      schema = z.string();
      break;
  }
  return field.required ? schema : schema.optional();
}

/** Builds a Zod object schema for a category's attributes, keyed exactly like
 * Listing.attributes — pass the same MarketplaceFieldDef[] on client and
 * server (e.g. fetched from getCategoryBySlug) so validation never drifts. */
export function buildAttributesSchema(fieldSchema: MarketplaceFieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fieldSchema) {
    shape[field.key] = zodForField(field);
  }
  return z.object(shape);
}

export function validateAttributes(fieldSchema: MarketplaceFieldDef[], attributes: unknown) {
  return buildAttributesSchema(fieldSchema).safeParse(attributes);
}
