"use server";

// Partner review from the marketplace dashboard: request changes or reject a
// submitted partner with an AI-drafted, admin-edited branded email, and
// archive partners (stale rejections, test accounts). TTTAdmin only.

import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getSystemRole } from "@/lib/airtable";
import { isTTTAdmin } from "@/lib/config";
import { getAllCategories, getListingsForPartnerAdmin, getPartnerById, updatePartner } from "@/lib/marketplace/data";
import { partnerCategoryLabel } from "@/lib/marketplace/partnerScreens";
import { buildPartnerReviewEmail } from "@/lib/email";

export type ReviewKind = "changes" | "reject";
type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function requireTTTAdmin(): Promise<{ userId: string; name: string; email: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");
  const role = await getSystemRole(userId).catch(() => null);
  if (role !== "TTTAdmin" && !isTTTAdmin(userId)) throw new Error("Only TTT Admins can review partners");
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? "";
  return { userId, name: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || email, email };
}

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

async function partnerContext(partnerId: string) {
  const partner = await getPartnerById(partnerId);
  if (!partner) throw new Error("Partner not found");
  const [listings, categories] = await Promise.all([getListingsForPartnerAdmin(partnerId), getAllCategories()]);
  const label = new Map(categories.map((c) => [c.id, partnerCategoryLabel(c.label)]));
  const categoryNames = listings.map((l) => label.get(l.categoryId)).filter(Boolean) as string[];
  return { partner, categoryNames };
}

const SUBJECTS: Record<ReviewKind, (company: string) => string> = {
  changes: (c) => `A few updates for your Top Tier partner profile (${c})`,
  reject: (c) => `Your Top Tier partner network application (${c})`,
};

/** AI draft from the admin's few words. Returns subject + plain-text body. */
export async function draftPartnerReviewEmailAction(partnerId: string, kind: ReviewKind, reason: string): Promise<Result<{ subject: string; body: string }>> {
  try {
    await requireTTTAdmin();
    const why = reason.trim().slice(0, 1500);
    if (!why) throw new Error("Add a few words on why first");
    const { partner, categoryNames } = await partnerContext(partnerId);
    const firstName = (partner.pocName || "").split(" ")[0];

    const prompt = `You write emails for Top Tier Transitions (TTT), a premium senior move management company in the Chicago area. Its Rightsize platform matches families who are moving with vetted partners (senior communities, realtors, movers, haulers, donation organizations, care providers, estate attorneys, financial advisors and more).

A partner signed up for the Top Tier partner network and submitted their profile for review.
Partner: ${partner.companyName}${partner.city ? `, ${partner.city}` : ""}
Contact first name: ${firstName || "(unknown)"}
Categories: ${categoryNames.join(", ") || "(none)"}

Decision: ${kind === "changes"
  ? "We need some changes before we can approve their profile. They can update it themselves in the partner portal (My Listing) and resubmit."
  : "We are not approving them for the partner network at this time."}
Reviewer's notes (the reasons, in their own words): ${why}

Write the email body to the partner.
- Warm, professional and respectful. Short: 2 to 4 short paragraphs.
- Greet them by first name if known.
- ${kind === "changes"
  ? "Thank them for signing up, then explain clearly and specifically what needs to change, based on the reviewer's notes. If there are several items, put each on its own line starting with \"- \". Say we'll take another look as soon as they resubmit."
  : "Thank them for their interest, then explain kindly and briefly why we can't approve them right now, based on the reviewer's notes, without sounding harsh. If it fits the notes, leave the door open for the future."}
- Don't invent facts, policies or promises that aren't in the notes. No subject line in the body. No signature block beyond "The Top Tier Transitions team". Don't use em dashes.`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 4000,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: { type: "object", additionalProperties: false, required: ["body"], properties: { body: { type: "string" } } },
        },
      },
      messages: [{ role: "user", content: prompt }],
    });
    if (msg.stop_reason === "refusal") throw new Error("The AI couldn't draft this one. Write it by hand.");
    const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
    const body = (JSON.parse(text) as { body: string }).body.trim();
    return { ok: true, data: { subject: SUBJECTS[kind](partner.companyName), body } };
  } catch (e) {
    return fail(e);
  }
}

/** Sends the review email. Test: to the admin only, no status change.
 * Real: to the partner, then status -> "Waiting on Partner" or "Rejected". */
export async function sendPartnerReviewEmailAction(
  partnerId: string,
  kind: ReviewKind,
  subject: string,
  body: string,
  test: boolean
): Promise<Result<{ sentTo: string }>> {
  try {
    const admin = await requireTTTAdmin();
    if (!subject.trim() || !body.trim()) throw new Error("Subject and message are required");
    const { partner } = await partnerContext(partnerId);
    const to = test ? admin.email : partner.email;
    if (!to) throw new Error(test ? "No email on your account" : "This partner has no email on file");
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) throw new Error("Email isn't configured");

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim();
    const html = buildPartnerReviewEmail({
      kind,
      companyName: partner.companyName,
      body: body.trim(),
      ctaUrl: kind === "changes" ? `${appUrl}/partner/listing` : undefined,
    });
    const { error } = await new Resend(resendKey).emails.send({
      from: `Top Tier Transitions <${process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com"}>`,
      to,
      replyTo: admin.email || undefined,
      subject: test ? `[TEST] ${subject.trim()}` : subject.trim(),
      html,
    });
    if (error) throw new Error(error.message);

    if (!test) {
      await updatePartner(partnerId, {
        lifecycleStatus: kind === "changes" ? "Waiting on Partner" : "Rejected",
        reviewFeedback: body.trim(),
        reviewedAt: new Date().toISOString(),
        reviewedBy: admin.name,
      });
      revalidatePath("/admin/marketplace");
      revalidatePath("/admin/marketplace/partners");
      revalidatePath(`/admin/marketplace/partners/${partnerId}`);
      revalidatePath("/partner/listing");
    }
    return { ok: true, data: { sentTo: to } };
  } catch (e) {
    return fail(e);
  }
}

export async function archivePartnerAction(partnerId: string): Promise<Result> {
  try {
    await requireTTTAdmin();
    await updatePartner(partnerId, { lifecycleStatus: "Archived" });
    revalidatePath("/admin/marketplace");
    revalidatePath("/admin/marketplace/partners");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
