"use server";

// Client partner reviews (left from the "Your Partners" tray on /partners):
// edit, hide/publish, and delete, plus each partner's "Display score"
// toggle. TTTAdmin only — re-checked here since every server action is its
// own entry point, independent of the /admin/marketplace layout check.

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { getSystemRole, updatePartnerReview, deletePartnerReview } from "@/lib/airtable";
import { isTTTAdmin } from "@/lib/config";
import { updatePartner } from "@/lib/marketplace/data";
import { MAX_REVIEW_COMMENT_LENGTH } from "@/lib/partners/reviewTags";
import type { PartnerReview } from "@/lib/types";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function requireTTTAdmin(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");
  const role = await getSystemRole(userId).catch(() => null);
  if (role !== "TTTAdmin" && !isTTTAdmin(userId)) throw new Error("Only TTT Admins can edit reviews");
  const user = await currentUser();
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.primaryEmailAddress?.emailAddress || userId;
}

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

// Every review write and toggle changes what the directory shows
function revalidateReviews() {
  revalidateTag("partners-directory");
  revalidatePath("/admin/marketplace/reviews");
  revalidatePath("/admin/marketplace/partners");
}

const recordId = z.string().regex(/^rec[A-Za-z0-9]{14}$/);

const editSchema = z.object({
  score: z.number().int().min(1).max(5),
  tags: z.array(z.string().min(1).max(60)).max(15),
  comment: z.string().max(MAX_REVIEW_COMMENT_LENGTH),
  status: z.enum(["Published", "Hidden"]),
});

export async function updateReviewAction(id: string, input: z.input<typeof editSchema>): Promise<Result<PartnerReview>> {
  try {
    const editedBy = await requireTTTAdmin();
    const parsed = editSchema.safeParse(input);
    if (!parsed.success || !recordId.safeParse(id).success) return { ok: false, error: "That review wasn't valid." };
    const { score, tags, comment, status } = parsed.data;
    const review = await updatePartnerReview(id, { score: score as PartnerReview["score"], tags, comment: comment.trim(), status, editedBy });
    revalidateReviews();
    return { ok: true, data: review };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteReviewAction(id: string): Promise<Result> {
  try {
    await requireTTTAdmin();
    if (!recordId.safeParse(id).success) return { ok: false, error: "Invalid review" };
    await deletePartnerReview(id);
    revalidateReviews();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setDisplayReviewScoreAction(partnerId: string, display: boolean): Promise<Result> {
  try {
    await requireTTTAdmin();
    if (!recordId.safeParse(partnerId).success || typeof display !== "boolean") return { ok: false, error: "Invalid partner" };
    await updatePartner(partnerId, { displayReviewScore: display });
    revalidateReviews();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
