// Marketplace leads (introduction events) as admins and partners see them.
// Server-only.
//
// A lead is "held" until it's released: today every listing routes intros
// to TTT admins, who review them in Admin > Marketplace > Leads and press
// "Release to partner". Releasing makes the lead visible on the partner's
// portal Leads page and sends the partner an email (and a push if they use
// the app), and the client a "we've reached out" confirmation.
//
// What a partner can see: client name, email, phone, category, the
// client's answers, request date, and status. Never the referral terms,
// the project, the home address, or other partners matched to the client.
import "server-only";
import { getReferralContactById } from "@/lib/airtable";
import { sendPartnerIntroPartnerNotification, sendPartnerIntroClientConfirmation } from "@/lib/admin-notifications";
import { sendPushToClerkUsers } from "@/lib/push-send";
import { formatAnswersForEmail, migrateLegacyAnswerKeys } from "@/lib/partners/questions";
import type { PartnerCategory } from "@/lib/types";
import { getAllCategories, getAllListingsAdmin, getAllPartners, getIntroductionEventById, releaseIntroductionEvent } from "./data";
import type { MarketplaceIntroductionEvent, MarketplaceIntroductionStatus, MarketplacePartner } from "./types";
import { leadRecipients } from "./team";

/**
 * Sends a released lead to the partner company, following its lead routing
 * (everyone, or chosen teammates; business email on or off): an email to
 * each, and a push to their phones (plus the company's CRM contact, for
 * accounts that predate teams).
 * Resolves to which channels went out.
 */
export async function sendLeadToPartnerTeam(params: {
  partner: Pick<MarketplacePartner, "id" | "companyName" | "email" | "crmReferralContactId" | "leadRouting" | "leadSkipBusinessEmail">;
  clientName: string;
  category: string;
  clientEmail?: string;
  clientPhone?: string;
  answers: Array<{ label: string; value: string }>;
  trackingToken: string;
}): Promise<{ emailed: boolean; pushed: boolean }> {
  const { partner } = params;
  const team = await leadRecipients(partner);
  const business = partner.leadSkipBusinessEmail ? undefined : partner.email?.toLowerCase();
  let emails = [...new Set([business, ...team.emails].filter((e): e is string => !!e))];
  // Never let a lead go nowhere
  if (emails.length === 0 && partner.email) emails = [partner.email.toLowerCase()];

  const sent = await Promise.allSettled(emails.map((vendorEmail) =>
    sendPartnerIntroPartnerNotification({
      vendorName: partner.companyName,
      vendorEmail,
      clientName: params.clientName,
      category: params.category,
      clientEmail: params.clientEmail,
      clientPhone: params.clientPhone,
      answers: params.answers,
      trackingToken: params.trackingToken,
    })
  ));
  sent.forEach((r) => { if (r.status === "rejected") console.error("[leads] partner email failed:", r.reason); });

  let pushed = false;
  try {
    const contact = partner.crmReferralContactId ? await getReferralContactById(partner.crmReferralContactId).catch(() => null) : null;
    // The old single login only gets pushes if it isn't on the team yet;
    // once it is, the company's routing decides
    const legacy = contact?.clerkUserId && !team.allClerkUserIds.includes(contact.clerkUserId) ? [contact.clerkUserId] : [];
    const clerkIds = [...new Set([...team.clerkUserIds, ...legacy])];
    if (clerkIds.length > 0) {
      await sendPushToClerkUsers(
        clerkIds,
        { title: "New client introduction", body: `${params.clientName || "A family"} is looking for ${params.category || "your services"}.`, url: "/partner/leads" },
        { type: "Other" }
      );
      pushed = true;
    }
  } catch (e) {
    console.error("[leads] partner push failed:", e);
  }
  return { emailed: sent.some((r) => r.status === "fulfilled"), pushed };
}

/** Statuses a partner can set from their Leads page. */
export const PARTNER_LEAD_STATUSES = ["Contacted", "Engaged", "Declined"] as const;
export type PartnerLeadStatus = (typeof PARTNER_LEAD_STATUSES)[number];

export interface LeadView {
  id: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  category: string;
  answers: Array<{ label: string; value: string }>;
  requestedAt: string;
  status: MarketplaceIntroductionStatus;
  statusUpdatedAt?: string;
}

/** The category label for each listing, used to label and format leads. */
export async function getListingCategoryLabels(): Promise<Map<string, string>> {
  const [listings, categories] = await Promise.all([getAllListingsAdmin(), getAllCategories()]);
  const label = new Map(categories.map((c) => [c.id, c.label]));
  return new Map(listings.map((l) => [l.id, label.get(l.categoryId) ?? ""]));
}

export function formatLeadAnswers(category: string, snapshot: Record<string, string | string[]>) {
  if (!category) return [];
  try {
    return formatAnswersForEmail(category as PartnerCategory, migrateLegacyAnswerKeys(category as PartnerCategory, snapshot));
  } catch {
    return [];
  }
}

/** Partner-safe view: drops referral terms, tenant id and tracking token. */
export function toLeadView(e: MarketplaceIntroductionEvent, category: string): LeadView {
  return {
    id: e.id,
    clientName: e.clientName,
    clientEmail: e.clientEmail,
    clientPhone: e.clientPhone,
    category,
    answers: formatLeadAnswers(category, e.categoryAnswersSnapshot),
    requestedAt: e.requestedAt,
    status: e.status,
    statusUpdatedAt: e.statusUpdatedAt,
  };
}

export async function releaseLead(eventId: string, actorName: string): Promise<{ emailed: boolean; pushed: boolean }> {
  const event = await getIntroductionEventById(eventId);
  if (!event) throw new Error("Lead not found");
  if (event.releasedAt) throw new Error("This lead was already released");

  const [partners, categories] = await Promise.all([getAllPartners(), getListingCategoryLabels()]);
  const partner = partners.find((p) => p.id === event.partnerId);
  if (!partner) throw new Error("Partner not found");
  const category = categories.get(event.listingId) ?? "";

  await releaseIntroductionEvent(event.id, actorName);

  const answers = formatLeadAnswers(category, event.categoryAnswersSnapshot);
  const results = await Promise.allSettled([
    sendLeadToPartnerTeam({
      partner,
      clientName: event.clientName,
      category,
      clientEmail: event.clientEmail || undefined,
      clientPhone: event.clientPhone || undefined,
      answers,
      trackingToken: event.trackingToken,
    }),
    sendPartnerIntroClientConfirmation({
      clientEmail: event.clientEmail || undefined,
      clientName: event.clientName,
      partnerName: partner.companyName,
      category,
    }),
  ]);
  results.forEach((r) => { if (r.status === "rejected") console.error("[leads] release side effect failed:", r.reason); });
  const team = results[0].status === "fulfilled" ? results[0].value : { emailed: false, pushed: false };
  return team;
}
