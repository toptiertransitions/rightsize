import { z } from "zod";

export const step1Schema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  currentZip: z.string().trim().regex(/^\d{5}$/, "Enter a 5-digit zip code"),
});
export type Step1Input = z.infer<typeof step1Schema>;

export const SERVICE_INTERESTS = [
  "full_service",
  "realtor",
  "mover",
  "senior_community",
  "donation",
  "hauling",
] as const;

export const step2Schema = z.object({
  serviceInterests: z.array(z.enum(SERVICE_INTERESTS)).max(SERVICE_INTERESTS.length),
  appOnlyIntent: z.boolean(),
});
export type Step2Input = z.infer<typeof step2Schema>;

export const step3Schema = z.object({
  timelineType: z.enum(["range", "month", "date"]),
  timelineValue: z.string().trim().min(1, "Please choose a timeline"),
});
export type Step3Input = z.infer<typeof step3Schema>;

export const step4Schema = z.object({
  destinationType: z.enum(["house", "condo", "senior_community", "other"]),
  destinationZip: z.string().trim().regex(/^\d{5}$/).optional().or(z.literal("")),
  destinationCommunity: z.string().trim().optional(),
  destinationCommunityOther: z.string().trim().max(200).optional(),
});
export type Step4Input = z.infer<typeof step4Schema>;

export const step5Schema = z.object({
  sqftRange: z.enum(["under_1000", "1000_2000", "2000_3000", "3000_4500", "4500_plus", "not_sure"]),
  sqftExact: z.number().int().positive().max(50000).optional(),
  homeDensity: z.enum(["light", "comfortable", "full", "collector"]),
});
export type Step5Input = z.infer<typeof step5Schema>;

export const spaceSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1).max(60),
  on: z.boolean(),
});

export const step6Schema = z.object({
  bedrooms: z.number().int().min(0).max(20),
  bathrooms: z.number().min(0).max(20).multipleOf(0.5),
  spaces: z.array(spaceSchema).max(40),
});
export type Step6Input = z.infer<typeof step6Schema>;
