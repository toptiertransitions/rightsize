// Resale update email types and labels. Client-safe (no templates).
export type ResaleEmailType = "hands-on" | "day30" | "day60" | "day90";

/** Send order. Day emails never go out of order. */
export const RESALE_EMAIL_ORDER: ResaleEmailType[] = ["hands-on", "day30", "day60", "day90"];
export const DAY_EMAILS: Exclude<ResaleEmailType, "hands-on">[] = ["day30", "day60", "day90"];
export const DAY_OFFSET: Record<Exclude<ResaleEmailType, "hands-on">, number> = { day30: 30, day60: 60, day90: 90 };
export const RESALE_EMAIL_LABEL: Record<ResaleEmailType, string> = {
  "hands-on": "Hands-on complete",
  day30: "Day 30 Update",
  day60: "Day 60 Update and 90-day plan",
  day90: "Day 90 Window Closed",
};
export const isResaleEmailType = (v: unknown): v is ResaleEmailType =>
  typeof v === "string" && (RESALE_EMAIL_ORDER as string[]).includes(v);
