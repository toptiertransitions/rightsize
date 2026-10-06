"use server";

import { getAllPartners, getAllListingsAdmin, createIntroductionEvent } from "@/lib/marketplace/data";

// Public-facing — no auth. Captures the request and snapshots referral
// terms server-side (never sent to the client). This is deliberately the
// minimal version: it records the request so real demand data starts
// flowing immediately, but it does NOT yet send the partner-facing email,
// show the disclosure-acknowledgment step, or create a CRM lead — all of
// that is Phase 5 ("Matching and Onboarding rebuild, disclosure and credit
// flow, intro requests, CRM lead creation").
export async function createPublicIntroductionRequestAction(data: {
  partnerSlug: string;
  categorySlug: string;
  name: string;
  email: string;
  phone: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!data.name.trim() || !data.email.trim()) {
    return { ok: false, error: "Name and email are required." };
  }
  try {
    const [partners, listings] = await Promise.all([getAllPartners(), getAllListingsAdmin()]);
    const partner = partners.find((p) => p.slug === data.partnerSlug);
    if (!partner) return { ok: false, error: "Partner not found." };
    const listing = listings.find((l) => l.partnerId === partner.id && l.status === "Live");
    if (!listing) return { ok: false, error: "This partner isn't currently accepting introductions." };

    await createIntroductionEvent({
      listingId: listing.id,
      partnerId: partner.id,
      tenantId: "",
      clientName: data.name.trim(),
      clientEmail: data.email.trim(),
      clientPhone: data.phone.trim(),
      categoryAnswersSnapshot: {},
      referralTermsSnapshot: { feeType: listing.feeType, feeValue: listing.feeValue, creditToSeniorPercent: listing.creditToSeniorPercent },
      channel: "Email",
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
