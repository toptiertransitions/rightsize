"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Resend } from "resend";
import { getPartnerAccount } from "@/lib/marketplace/partnerAccount";
import { updatePartner, updateListing } from "@/lib/marketplace/data";
import { computeListingCompleteness } from "@/lib/marketplace/completeness";
import { zipsForCounties, isKnownCounty } from "@/lib/marketplace/counties";
import { getPartnerCriteria, MATCH_CRITERIA_ATTR, readMatchCriteria } from "@/lib/partners/criteria";
import { getAdminEmails } from "@/lib/admin-notifications";
import { updateReferralCompany, updateReferralContact } from "@/lib/airtable";
import type { PartnerCategory } from "@/lib/types";

type Result = { ok: true } | { ok: false; error: string };

async function requireAccount() {
  const { userId } = await auth();
  if (!userId) throw new Error("Please sign in again.");
  const account = await getPartnerAccount(userId);
  if (!account) throw new Error("We couldn't find your partner profile. Please contact Top Tier.");
  return account;
}

async function run(fn: () => Promise<void>): Promise<Result> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    console.error("[partner setup]", e);
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong. Please try again." };
  }
}

const businessSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required").max(120),
  pocName: z.string().trim().min(1, "Your name is required").max(120),
  phone: z.string().trim().max(40),
  website: z.string().trim().max(200),
  city: z.string().trim().max(80),
  state: z.string().trim().max(2),
  zip: z.string().trim().max(10),
});

export async function saveBusinessAction(input: z.input<typeof businessSchema>): Promise<Result> {
  return run(async () => {
    const { partner } = await requireAccount();
    const d = businessSchema.parse(input);
    const state = d.state.toUpperCase();
    await updatePartner(partner.id, { ...d, state });
    // The CRM record is the source of truth for these shared fields (admin
    // re-syncs the marketplace record from it), so write them there too.
    if (partner.crmReferralCompanyId) {
      await updateReferralCompany(partner.crmReferralCompanyId, { name: d.companyName, website: d.website, city: d.city, state, zip: d.zip });
    }
    if (partner.crmReferralContactId) {
      await updateReferralContact(partner.crmReferralContactId, { name: d.pocName, phone: d.phone });
    }
  });
}

const aboutSchema = z.object({
  logo: z.string().trim().max(500),
  shortBio: z.string().trim().max(160),
  aboutUs: z.string().trim().max(3000),
});

export async function saveAboutAction(input: z.input<typeof aboutSchema>): Promise<Result> {
  return run(async () => {
    const { partner } = await requireAccount();
    await updatePartner(partner.id, aboutSchema.parse(input));
  });
}

const areaSchema = z.object({
  deliveryMode: z.enum(["In-person", "Virtual", "Both"]),
  counties: z.array(z.string()).max(102),
  extraZips: z.array(z.string().regex(/^\d{5}$/)).max(500),
  statewide: z.boolean(),
});

export async function saveServiceAreaAction(input: z.input<typeof areaSchema>): Promise<Result> {
  return run(async () => {
    const { partner } = await requireAccount();
    const d = areaSchema.parse(input);
    const counties = d.counties.filter(isKnownCounty);
    const zips = [...new Set([...zipsForCounties(counties), ...d.extraZips])];
    await updatePartner(partner.id, {
      deliveryMode: d.deliveryMode,
      // Nationwide stays an admin call
      serviceArea: { zips, counties, statewide: d.statewide, nationwide: partner.serviceArea.nationwide },
    });
  });
}

/** Saves one listing's matching criteria and/or category details. Only
 * known criteria questions/options and the category's own fields are
 * written; anything else in the payload is ignored. */
export async function saveListingAction(
  listingId: string,
  patch: { criteria?: Record<string, string[]>; fields?: Record<string, unknown> }
): Promise<Result> {
  return run(async () => {
    const { listings } = await requireAccount();
    const listing = listings.find((l) => l.id === listingId);
    if (!listing) throw new Error("That listing isn't yours.");

    const attributes: Record<string, unknown> = { ...listing.attributes };

    if (patch.criteria) {
      const merged = { ...readMatchCriteria(attributes) };
      for (const c of getPartnerCriteria(listing.category.label as PartnerCategory)) {
        if (!(c.questionId in patch.criteria)) continue;
        const valid = new Set(c.options.map((o) => o.value));
        merged[c.questionId] = (patch.criteria[c.questionId] ?? []).filter((v) => valid.has(v));
      }
      attributes[MATCH_CRITERIA_ATTR] = merged;
    }

    if (patch.fields) {
      for (const f of listing.category.fieldSchema) {
        if (f.type === "file" || !(f.key in patch.fields)) continue;
        attributes[f.key] = patch.fields[f.key];
      }
    }

    await updateListing(listing.id, {
      attributes,
      completenessPercent: computeListingCompleteness(attributes, listing.category),
    });
  });
}

/** Last step: hands the profile to TTT for review. Listings go Draft ->
 * Submitted, the partner Invited -> Submitted, and admins get an email. */
export async function submitSetupAction(): Promise<Result> {
  return run(async () => {
    const { partner, listings, contact } = await requireAccount();
    for (const l of listings) {
      if (l.status === "Draft") await updateListing(l.id, { status: "Submitted" });
    }
    if (partner.lifecycleStatus === "Invited" || partner.lifecycleStatus === "Prospect") {
      await updatePartner(partner.id, { lifecycleStatus: "Submitted" });
    }

    const resendKey = process.env.RESEND_API_KEY;
    const admins = await getAdminEmails().catch(() => []);
    if (resendKey && admins.length > 0) {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim();
      const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const cats = esc(listings.map((l) => l.category.label).join(", "));
      const link = `${appUrl}/admin/marketplace/partners/${partner.id}`;
      await new Resend(resendKey).emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "noreply@toptiertransitions.com",
        to: admins,
        subject: `Partner profile ready for review: ${partner.companyName}`,
        html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;">
          <p style="font-size:16px;font-weight:700;color:#111827;">${esc(partner.companyName)} finished their partner setup</p>
          <p style="font-size:14px;color:#4B5563;line-height:1.6;">${esc(contact.name || partner.pocName)} completed their profile and matching criteria for <strong>${cats}</strong>. Review it and move the listings to Live when it looks good.</p>
          <p><a href="${link}" style="display:inline-block;background:#2d4a3e;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Review partner</a></p>
        </div>`,
      }).catch((e) => console.error("[partner setup] admin email failed:", e));
    }

    revalidatePath("/partner/home");
    revalidatePath("/admin/marketplace/partners");
  });
}

/** Categories are the one thing partners can't change themselves: this
 * emails TTT Admins the request. */
export async function requestCategoryChangeAction(message: string): Promise<Result> {
  return run(async () => {
    const { partner, contact, listings } = await requireAccount();
    const text = message.trim().slice(0, 2000);
    if (!text) throw new Error("Tell us what you'd like to change.");
    const resendKey = process.env.RESEND_API_KEY;
    const admins = await getAdminEmails().catch(() => []);
    if (!resendKey || admins.length === 0) throw new Error("We couldn't send that right now. Please email us instead.");
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim();
    const { error } = await new Resend(resendKey).emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "noreply@toptiertransitions.com",
      to: admins,
      ...(contact.email ? { replyTo: contact.email } : {}),
      subject: `Category change request: ${partner.companyName}`,
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;">
        <p style="font-size:16px;font-weight:700;color:#111827;">${esc(partner.companyName)} asked to change their categories</p>
        <p style="font-size:13px;color:#6B7280;">Current: ${esc(listings.map((l) => l.category.label).join(", ") || "none")}</p>
        <p style="font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap;background:#F9FAFB;border-radius:8px;padding:12px;">${esc(text)}</p>
        <p style="font-size:13px;color:#6B7280;">From ${esc(contact.name || partner.pocName)}${contact.email ? ` (${esc(contact.email)})` : ""}. Reply to this email to respond.</p>
        <p><a href="${appUrl}/admin/marketplace/partners/${partner.id}" style="display:inline-block;background:#2d4a3e;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Open partner</a></p>
      </div>`,
    });
    if (error) throw new Error("We couldn't send that right now. Please try again.");
  });
}
