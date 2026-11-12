// Client-safe pieces of resident invites (see residentInvites.ts).
import { z } from "zod";

export const residentInviteSchema = z.object({
  name: z.string().trim().min(1, "Add their name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  moveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).transform((v) => v || undefined),
});

export type ResidentInviteInput = z.input<typeof residentInviteSchema>;
export type ResidentInviteResult = { ok: true } | { ok: false; error: string };

/** What the invites list shows (no internal ids beyond the invite's own). */
export interface ResidentInviteRow {
  id: string;
  name: string;
  email: string;
  moveDate?: string;
  status: "Invited" | "Joined" | "Canceled";
  invitedByName: string;
  invitedBySide: "Top Tier" | "Community";
  createdAt: string;
  lastSentAt?: string;
  sendCount: number;
  joinedAt?: string;
}
