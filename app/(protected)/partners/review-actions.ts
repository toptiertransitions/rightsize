"use server";

// Client reviews of their selected partners (the "Your Partners" tray on
// /partners). One review per (project, partner, reviewer); submitting again
// edits it. Only the project's Owner/Collaborator clients can review — staff
// edit reviews in /admin/marketplace/reviews instead.

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { getUserRoleForTenant, getPartnerSelectionsForTenant, upsertPartnerReview } from "@/lib/airtable";
import { getPartnerDirectory } from "@/lib/partners/queries";
import { isDemoTenant } from "@/lib/demo";
import { MAX_REVIEW_COMMENT_LENGTH } from "@/lib/partners/reviewTags";
import { PARTNER_CATEGORIES, type PartnerReview } from "@/lib/types";
import { isReviewableCategory } from "@/lib/partners/reviews";

const CLIENT_REVIEW_ROLES = ["Owner", "Collaborator"];

const inputSchema = z.object({
  tenantId: z.string().min(1),
  category: z.enum(PARTNER_CATEGORIES),
  partnerId: z.string().min(1),
  score: z.number().int().min(1).max(5),
  tags: z.array(z.string().min(1).max(60)).max(15),
  comment: z.string().max(MAX_REVIEW_COMMENT_LENGTH),
});

export type MyPartnerReview = Pick<PartnerReview, "id" | "score" | "tags" | "comment">;
type Result = { ok: true; review: MyPartnerReview } | { ok: false; error: string };

export async function submitPartnerReviewAction(input: z.input<typeof inputSchema>): Promise<Result> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That review wasn't valid — please try again." };
  const { tenantId, category, partnerId, score, tags, comment } = parsed.data;

  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Please sign in again." };

  const role = await getUserRoleForTenant(userId, tenantId).catch(() => null);
  if (!role || !CLIENT_REVIEW_ROLES.includes(role)) {
    return { ok: false, error: "Only the project's clients can leave partner reviews." };
  }
  if (!isReviewableCategory(category)) return { ok: false, error: "This partner can't be reviewed." };

  // Only a real marketplace partner the client actually has on their team.
  const [selections, directory] = await Promise.all([getPartnerSelectionsForTenant(tenantId), getPartnerDirectory()]);
  const isSelected = selections.some((s) => s.category === category && s.partnerId === partnerId);
  if (!isSelected || !directory.some((p) => p.id === partnerId)) {
    return { ok: false, error: "You can only review partners on your team." };
  }

  const user = await currentUser().catch(() => null);
  const reviewerName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.emailAddresses?.[0]?.emailAddress || "";

  try {
    const review = await upsertPartnerReview(
      { tenantId, partnerId, reviewerUserId: userId, reviewerName, category },
      { score: score as PartnerReview["score"], tags, comment: comment.trim() },
      // Demo/review accounts keep their reviews, but never in a real average
      isDemoTenant(tenantId) ? "Hidden" : "Published"
    );
    revalidateTag("partners-directory");
    return { ok: true, review: { id: review.id, score: review.score, tags: review.tags, comment: review.comment } };
  } catch (e) {
    console.error("[partners] review save failed:", e);
    return { ok: false, error: "Couldn't save your review — please try again." };
  }
}
