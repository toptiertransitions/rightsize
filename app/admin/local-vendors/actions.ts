"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { isTTTAdmin } from "@/lib/config";
import { decideRehomingSubmission, getLocalVendorById } from "@/lib/airtable";
import { sendRehomingDecisionToSubmitter } from "@/lib/admin-notifications";

type Result = { ok: true } | { ok: false; error: string };

const inputSchema = z.object({ id: z.string().min(1), note: z.string().trim().max(1000) });

// Approve → IsActive on, live in Rehoming Resources for all staff. Reject →
// stays inactive (kept for the record). Either way the submitter is emailed.
async function decide(id: string, note: string, approve: boolean): Promise<Result> {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) return { ok: false, error: "Only admins can review submissions." };
  const parsed = inputSchema.safeParse({ id, note });
  if (!parsed.success) return { ok: false, error: "That request wasn't valid." };

  const existing = await getLocalVendorById(parsed.data.id);
  if (!existing) return { ok: false, error: "That submission no longer exists." };
  if (existing.submissionStatus !== "Pending") {
    return { ok: false, error: `Already ${existing.submissionStatus?.toLowerCase() ?? "reviewed"}${existing.reviewedBy ? ` by ${existing.reviewedBy}` : ""}.` };
  }

  try {
    const user = await currentUser().catch(() => null);
    const reviewedBy = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "An admin";
    const vendor = await decideRehomingSubmission(parsed.data.id, { approve, reviewedBy, reviewNote: parsed.data.note });
    revalidateTag("rehoming-vendors");
    await sendRehomingDecisionToSubmitter(vendor, approve).catch((e) => console.error("[rehoming] decision email failed:", e));
    return { ok: true };
  } catch (e) {
    console.error("[rehoming] decision failed:", e);
    return { ok: false, error: "Couldn't save that. Please try again." };
  }
}

export async function approveRehomingSubmissionAction(id: string, note: string): Promise<Result> {
  return decide(id, note, true);
}

export async function rejectRehomingSubmissionAction(id: string, note: string): Promise<Result> {
  return decide(id, note, false);
}
