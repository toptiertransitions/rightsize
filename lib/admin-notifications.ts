import { clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { getStaffMembers, getReferralCompanyById, getReferralContactById, getActivitiesForContact, getOpportunitiesForTenant, getClientContactById, getMembershipsForTenant } from "./airtable";
import { isTTTAdmin } from "./config";
import { buildNewUserAdminEmail, buildStageProgressEmail, buildActiveReferralCelebrationEmail, buildNewPartnerAccountEmail, buildQuoteAlertEmail, buildNewVendorAdminEmail, buildDailyRecapEmail, buildScheduleModificationEmail, buildMoveManagementCrossSellEmail, buildPartnerIntroAdminNotificationEmail, buildPartnerDocumentSharedEmail, buildPartnerIntroRequestNotificationEmail, buildPartnerIntroConfirmationEmail, buildPartnerInviteEmail, buildMarketplacePartnerInviteEmail } from "./email";
import type { LocalVendor } from "./types";

// ─── Stage ordering for improvement detection ─────────────────────────────────
const STAGE_PROGRESSION = ["Identified", "Met", "Agreed to Refer", "Shared Leads", "Active Referral"];

function isStageImprovement(from: string, to: string): boolean {
  const fromIdx = STAGE_PROGRESSION.indexOf(from);
  const toIdx   = STAGE_PROGRESSION.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  return toIdx > fromIdx;
}

export async function getAdminEmails(): Promise<string[]> {
  const collected = new Set<string>();

  // 1. Airtable StaffRoles — staff whose Clerk ID is in TTT_ADMIN_USER_IDS
  try {
    const staff = await getStaffMembers();
    staff
      .filter(s => s.isActive && s.email && (s.role === "TTTAdmin" || isTTTAdmin(s.clerkUserId)))
      .forEach(s => collected.add((s.email as string).toLowerCase()));
  } catch { /* non-fatal */ }

  // 2. TTT_ADMIN_USER_IDS → Clerk lookup (catches admins with no/incomplete Airtable record)
  const adminIds = (process.env.TTT_ADMIN_USER_IDS ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (adminIds.length > 0) {
    try {
      const clerk = await clerkClient();
      for (const id of adminIds) {
        const u = await clerk.users.getUser(id).catch(() => null);
        const email =
          u?.emailAddresses.find(e => e.id === u.primaryEmailAddressId)?.emailAddress ??
          u?.emailAddresses[0]?.emailAddress;
        if (email) collected.add(email.toLowerCase());
      }
    } catch { /* non-fatal */ }
  }

  // 3. Hard-coded env var fallback
  (process.env.ADMIN_NOTIFICATION_EMAIL ?? "")
    .split(",").map(s => s.trim()).filter(Boolean)
    .forEach(e => collected.add(e.toLowerCase()));

  return [...collected];
}

export async function sendNewUserAdminNotification(params: {
  fullName: string;
  email: string;
  imageUrl?: string | null;
  userType: "client" | "staff" | "unknown";
  roleLabel: string;
  projectName?: string | null;
  projectAddress?: string | null;
}): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const adminEmails = await getAdminEmails();
  if (adminEmails.length === 0) return;

  const createdAt = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  const html = buildNewUserAdminEmail({ ...params, createdAt });
  const resend = new Resend(resendKey);
  await resend.emails.send({
    from: `Top Tier Transitions <${process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com"}>`,
    to: adminEmails,
    subject: `New User: ${params.fullName} (${params.roleLabel})`,
    html,
  });
}

// ─── CRM stage-change notification ───────────────────────────────────────────

export async function sendStageProgressNotification(params: {
  contactId: string;
  contactName: string;
  contactTitle?: string;
  referralCompanyId?: string;
  previousStage: string;
  newStage: string;
  nextStepDate?: string;
  nextStepNote?: string;
}): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;
  if (!isStageImprovement(params.previousStage, params.newStage)) return;

  const [company, activities, staff] = await Promise.all([
    params.referralCompanyId
      ? getReferralCompanyById(params.referralCompanyId).catch(() => null)
      : Promise.resolve(null),
    getActivitiesForContact(params.contactId).catch(() => []),
    getStaffMembers().catch(() => []),
  ]);

  const companyName = company?.name ?? "Unknown Company";

  // Identify the TTTSales owner of the company by Clerk ID
  const ownerClerkId = company?.assignedToClerkId;
  const ownerStaff = ownerClerkId ? staff.find(s => s.clerkUserId === ownerClerkId) : undefined;
  const ownerName = ownerStaff?.displayName ?? "the team";

  // Send to all active TTTSales only
  const recipients = staff
    .filter(s => s.isActive && s.email && s.role === "TTTSales")
    .map(s => s.email as string)
    .filter(Boolean);

  if (recipients.length === 0) return;

  const recentActivities = activities.slice(0, 4).map(a => ({
    date: a.activityDate,
    type: a.type,
    note: a.note,
  }));

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim();
  const crmUrl = params.referralCompanyId
    ? `${appUrl}/crm?tab=referrals&company=${params.referralCompanyId}`
    : `${appUrl}/crm?tab=referrals`;
  const resend = new Resend(resendKey);
  const from = `Top Tier Transitions <${process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com"}>`;

  if (params.newStage === "Active Referral") {
    const html = buildActiveReferralCelebrationEmail({
      contactName: params.contactName,
      contactTitle: params.contactTitle,
      companyName,
      ownerName,
      totalActivities: activities.length,
      recentActivities,
      nextStepDate: params.nextStepDate,
      nextStepNote: params.nextStepNote,
      crmUrl,
    });
    await resend.emails.send({
      from,
      to: recipients,
      subject: `🏆 Active Referral Unlocked — ${params.contactName} at ${companyName}`,
      html,
    });
  } else {
    const html = buildStageProgressEmail({
      contactName: params.contactName,
      contactTitle: params.contactTitle,
      companyName,
      previousStage: params.previousStage,
      newStage: params.newStage,
      ownerName,
      totalActivities: activities.length,
      recentActivities,
      nextStepDate: params.nextStepDate,
      nextStepNote: params.nextStepNote,
      crmUrl,
    });
    await resend.emails.send({
      from,
      to: recipients,
      subject: `🤝 ${params.contactName} moved to ${params.newStage} — ${companyName}`,
      html,
    });
  }
}

// ─── Partner Portal account activation ────────────────────────────────────────
// TO the TTTSales owner of the referral company; CC every other active
// TTTSales rep + all TTTAdmins. Falls back to admins-as-TO if the company has
// no assigned owner, so the notification never silently disappears.
export async function sendNewPartnerAccountNotification(params: {
  contactName: string;
  contactTitle?: string;
  contactEmail: string;
  contactPhone?: string;
  referralCompanyId?: string;
  currentStage?: string;
}): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const [company, staff, adminEmails] = await Promise.all([
    params.referralCompanyId
      ? getReferralCompanyById(params.referralCompanyId).catch(() => null)
      : Promise.resolve(null),
    getStaffMembers().catch(() => []),
    getAdminEmails().catch(() => [] as string[]),
  ]);

  const companyName = company?.name ?? "Unknown Company";

  const ownerClerkId = company?.assignedToClerkId;
  const ownerStaff = ownerClerkId ? staff.find(s => s.isActive && s.email && s.clerkUserId === ownerClerkId) : undefined;
  const ownerEmail = ownerStaff?.email as string | undefined;
  const ownerName = ownerStaff?.displayName ?? "the team";

  const isOwner = (email: string) => !!ownerEmail && email.toLowerCase() === ownerEmail.toLowerCase();

  const salesEmails = staff
    .filter(s => s.isActive && s.email && s.role === "TTTSales" && !isOwner(s.email as string))
    .map(s => s.email as string);

  const filteredAdminEmails = adminEmails.filter(e => !isOwner(e));

  const to = ownerEmail ? [ownerEmail] : (filteredAdminEmails.length > 0 ? filteredAdminEmails : salesEmails);
  if (to.length === 0) return;

  const ccSet = new Set<string>();
  for (const e of [...salesEmails, ...filteredAdminEmails]) {
    if (!to.some(t => t.toLowerCase() === e.toLowerCase())) ccSet.add(e);
  }
  const cc = [...ccSet];

  const activatedAt = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim();
  const crmUrl = params.referralCompanyId
    ? `${appUrl}/crm?tab=referrals&company=${params.referralCompanyId}`
    : `${appUrl}/crm?tab=referrals`;

  const html = buildNewPartnerAccountEmail({
    contactName: params.contactName,
    contactTitle: params.contactTitle,
    contactEmail: params.contactEmail,
    contactPhone: params.contactPhone,
    companyName,
    currentStage: params.currentStage,
    ownerName,
    activatedAt,
    crmUrl,
  });

  const resend = new Resend(resendKey);
  await resend.emails.send({
    from: `Top Tier Transitions <${process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com"}>`,
    to,
    ...(cc.length > 0 ? { cc } : {}),
    subject: `🎉 ${params.contactName} at ${companyName} activated their Partner Portal`,
    html,
  });
}

export async function sendNewVendorNotification(params: {
  vendor: LocalVendor;
  addedByClerkId: string;
  source: string;
}): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const adminEmails = await getAdminEmails();
  if (adminEmails.length === 0) return;

  let addedByName = "Unknown";
  let addedByEmail = "";
  try {
    const clerk = await clerkClient();
    const user = await clerk.users.getUser(params.addedByClerkId).catch(() => null);
    if (user) {
      addedByName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "Unknown";
      addedByEmail =
        user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress ??
        user.emailAddresses[0]?.emailAddress ??
        "";
    }
  } catch { /* non-fatal */ }

  const addedAt = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });

  const html = buildNewVendorAdminEmail({
    vendorName: params.vendor.vendorName,
    vendorType: params.vendor.vendorType,
    pocName: params.vendor.pocName || undefined,
    email: params.vendor.email || undefined,
    phone: params.vendor.phone || undefined,
    address: params.vendor.address || undefined,
    city: params.vendor.city || undefined,
    state: params.vendor.state || undefined,
    zip: params.vendor.zip || undefined,
    website: params.vendor.website || undefined,
    consignmentTake: params.vendor.consignmentTake > 0 ? params.vendor.consignmentTake : undefined,
    notes: params.vendor.notes || undefined,
    addedByName,
    addedByEmail,
    addedAt,
    source: params.source,
  });

  const ccEmail = addedByEmail && !adminEmails.includes(addedByEmail.toLowerCase())
    ? [addedByEmail]
    : undefined;

  const resend = new Resend(resendKey);
  await resend.emails.send({
    from: `Top Tier Transitions <${process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com"}>`,
    to: adminEmails,
    ...(ccEmail ? { cc: ccEmail } : {}),
    subject: `Internal Notification - New Vendor Added to Directory - ${params.vendor.vendorName} - ${params.vendor.vendorType}`,
    html,
  });
}

export async function sendQuoteAlertNotification({
  tenantId,
  tenantName,
  quotePhotos,
  contract,
  projectDetails,
}: {
  tenantId: string;
  tenantName: string;
  quotePhotos?: { url: string }[];
  contract: {
    totalCost: number;
    lineItems?: { serviceName: string; hours: number; rate: number; description?: string }[];
    discountCode?: string;
    discountAmount?: number;
    notInScope?: string;
  };
  projectDetails?: {
    targetStartDate?: string;
    targetMoveDate?: string;
    datesFlexible?: boolean;
    deadlineNotes?: string;
    disposalNotes?: string;
    specialItems?: string;
    vendorNotes?: string;
  };
}): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const [adminEmails, opportunities] = await Promise.all([
    getAdminEmails(),
    getOpportunitiesForTenant(tenantId).catch(() => []),
  ]);
  if (adminEmails.length === 0) return;

  // Prefer the first non-Won/Lost opportunity, fall back to any opportunity
  const opp =
    opportunities.find(o => o.stage !== "Won" && o.stage !== "Lost") ??
    opportunities[0];

  const contact = opp?.clientContactId
    ? await getClientContactById(opp.clientContactId).catch(() => null)
    : null;

  const clientName = contact?.name || tenantName;
  const cityForSubject = opp?.city || "";

  // Sales owner — same resolution as the CRM pipeline: the opportunity's
  // owner, falling back to the client contact's owner.
  const ownerClerkId = opp?.assignedToClerkId || contact?.assignedToClerkId;
  const needsStaff = !!ownerClerkId || !!contact?.staffReferralId;
  const staff = needsStaff ? await getStaffMembers().catch(() => []) : [];
  const staffName = (id?: string) =>
    id ? staff.find(s => s.clerkUserId === id || s.id === id)?.displayName : undefined;
  const salesOwner = staffName(ownerClerkId);

  // Referral source — name who actually referred them instead of the
  // generic source category, when the CRM has that link.
  let referralSource = contact?.source;
  if (contact?.referralPartnerId) {
    const refContact = await getReferralContactById(contact.referralPartnerId).catch(() => null);
    const refCompany = refContact?.referralCompanyId
      ? await getReferralCompanyById(refContact.referralCompanyId).catch(() => null)
      : null;
    const named = [
      refCompany?.name ? `<strong>${refCompany.name}</strong>` : "",
      refContact?.name ?? "",
    ].filter(Boolean).join(" &mdash; ");
    if (named) referralSource = named;
  } else if (contact?.staffReferralId) {
    const name = staffName(contact.staffReferralId);
    if (name) referralSource = `Staff Referral &mdash; <strong>${name}</strong>`;
  } else if (contact?.clientReferralId) {
    const referrer = await getClientContactById(contact.clientReferralId).catch(() => null);
    if (referrer?.name) referralSource = `Client Referral &mdash; <strong>${referrer.name}</strong>`;
  }

  const html = buildQuoteAlertEmail({
    clientName,
    clientEmail: contact?.email,
    salesOwner,
    referralSource,
    projectName: tenantName,
    opportunity: opp
      ? {
          stage: opp.stage,
          estimatedValue: opp.estimatedValue,
          address: opp.address,
          addressUnitNumber: opp.addressUnitNumber,
          city: opp.city,
          state: opp.state,
          zip: opp.zip,
          destAddress: opp.destAddress,
          destAddressUnitNumber: opp.destAddressUnitNumber,
          destCity: opp.destCity,
          destState: opp.destState,
          destZip: opp.destZip,
          seniorCommunityName: opp.seniorCommunityName,
          expectedCloseDate: opp.expectedCloseDate,
          notes: opp.notes,
          keyPeople: opp.keyPeople,
        }
      : undefined,
    contract,
    quotePhotos,
    projectDetails,
  });

  const subject = `Internal Alert - New Quote Sent (Not Signed Yet) to ${clientName}${cityForSubject ? ` in ${cityForSubject}` : ""}`;
  const resend = new Resend(resendKey);
  await resend.emails.send({
    from: `Top Tier Transitions <${process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com"}>`,
    to: adminEmails,
    subject,
    html,
  });
}

// ─── Daily Recap notification ─────────────────────────────────────────────────
export async function sendDailyRecapNotification(params: {
  projectName: string;
  recapDate: string;
  uploaderClerkId: string;
  aiRecapText: string;
  fileUrl: string;
  fileName: string;
}): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const staff = await getStaffMembers().catch(() => []);

  // Managers + Admins receive the daily recap email
  const toEmails = staff
    .filter(s => s.isActive && s.email && (s.role === "TTTManager" || s.role === "TTTAdmin"))
    .map(s => s.email as string);

  // Also get admin emails from env/Clerk as fallback
  const adminEmails = await getAdminEmails().catch(() => [] as string[]);
  const allTo = [...new Set([...toEmails, ...adminEmails])];
  if (allTo.length === 0) return;

  // Uploader info for CC
  let uploaderName = "TTT Staff";
  let uploaderEmail = "";
  try {
    const clerk = await clerkClient();
    const user = await clerk.users.getUser(params.uploaderClerkId).catch(() => null);
    if (user) {
      uploaderName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "TTT Staff";
      uploaderEmail =
        user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress ??
        user.emailAddresses[0]?.emailAddress ??
        "";
    }
  } catch { /* non-fatal */ }

  const ccEmails = uploaderEmail && !allTo.includes(uploaderEmail.toLowerCase())
    ? [uploaderEmail]
    : undefined;

  const html = buildDailyRecapEmail({
    projectName: params.projectName,
    recapDate: params.recapDate,
    uploaderName,
    aiRecapText: params.aiRecapText,
    fileName: params.fileName,
  });

  // Fetch file as attachment
  let attachments: { filename: string; content: Buffer }[] | undefined;
  try {
    const fileRes = await fetch(params.fileUrl);
    if (fileRes.ok) {
      const buf = await fileRes.arrayBuffer();
      attachments = [{ filename: params.fileName, content: Buffer.from(buf) }];
    }
  } catch { /* non-fatal — send without attachment */ }

  const displayDate = (() => {
    const [year, month, day] = params.recapDate.split("-");
    if (!year || !month || !day) return params.recapDate;
    return new Date(`${year}-${month}-${day}T12:00:00`).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });
  })();

  const resend = new Resend(resendKey);
  await resend.emails.send({
    from: `Top Tier Transitions <${process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com"}>`,
    to: allTo,
    ...(ccEmails ? { cc: ccEmails } : {}),
    subject: `Internal Notification - Daily Recap for ${params.projectName} on ${displayDate}`,
    html,
    ...(attachments ? { attachments } : {}),
  });
}

export async function sendMoveManagementCrossSellNotification(params: {
  clientName: string;
  projectName: string;
  tenantId: string;
  answers: Array<{ label: string; value: string }>;
}): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const adminEmails = await getAdminEmails().catch(() => [] as string[]);
  if (adminEmails.length === 0) return;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim();
  const html = buildMoveManagementCrossSellEmail({
    clientName: params.clientName,
    projectName: params.projectName,
    answers: params.answers,
    partnersUrl: `${appUrl}/partners?tenantId=${params.tenantId}`,
  });

  const resend = new Resend(resendKey);
  await resend.emails.send({
    from: `Top Tier Transitions <${process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com"}>`,
    to: adminEmails,
    subject: `Cross-Sell Opportunity: Full Move Management — ${params.clientName}`,
    html,
  });
}

export async function sendPartnerIntroAdminNotification(params: {
  clientName: string;
  projectName: string;
  tenantId: string;
  partnerName: string;
  category: string;
  clientEmail?: string;
  clientPhone?: string;
  answers: Array<{ label: string; value: string }>;
}): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const adminEmails = await getAdminEmails().catch(() => [] as string[]);
  if (adminEmails.length === 0) return;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim();
  const html = buildPartnerIntroAdminNotificationEmail({
    clientName: params.clientName,
    projectName: params.projectName,
    partnerName: params.partnerName,
    category: params.category,
    clientEmail: params.clientEmail,
    clientPhone: params.clientPhone,
    answers: params.answers,
    partnersUrl: `${appUrl}/partners?tenantId=${params.tenantId}`,
  });

  const resend = new Resend(resendKey);
  await resend.emails.send({
    from: `Top Tier Transitions <${process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com"}>`,
    to: adminEmails,
    subject: `Partner Intro Requested — ${params.clientName} → ${params.partnerName}`,
    html,
  });
}

/** Sends the same Partner Portal invite email the CRM tab's existing
 * invite flow sends (app/api/partner/invite/route.ts), for the
 * marketplace admin's own "Invite to Partner Portal" action — same
 * portal, same email, just a second staff-initiated door into it. */
export async function sendPartnerPortalInviteEmail(params: {
  inviterName: string;
  partnerName: string;
  partnerEmail: string;
}): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || !params.partnerEmail) return;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim();
  const portalUrl = `${appUrl}/sign-up?redirect_url=%2Fapi%2Fpartner%2Factivate`;

  const resend = new Resend(resendKey);
  await resend.emails.send({
    from: `${params.inviterName} <${process.env.RESEND_FROM_EMAIL ?? "noreply@toptiertransitions.com"}>`,
    to: params.partnerEmail,
    subject: `${params.inviterName} invited you to the Top Tier Partner Portal`,
    html: buildPartnerInviteEmail({ inviterName: params.inviterName, partnerName: params.partnerName, portalUrl }),
  });
}

/** Marketplace partner invite from /admin/partners. The sign-up link
 * carries their email (prefilled on the form) and lands on
 * /api/partner/activate, which links the new account to their CRM contact
 * by that email and sends them on to set up their listing. */
export async function sendMarketplacePartnerInviteEmail(params: {
  inviterName: string;
  inviterEmail?: string;
  partnerName: string;
  partnerEmail: string;
  companyName: string;
  categoryLabels: string[];
}): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) throw new Error("Email isn't configured");

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim();
  // Under /invite so it opens straight in the Rightsize app when installed
  // (Universal Links); app/invite/partner leads on to the prefilled sign-up.
  const signUpUrl = `${appUrl}/invite/partner?email=${encodeURIComponent(params.partnerEmail)}`;

  const resend = new Resend(resendKey);
  const { error } = await resend.emails.send({
    from: `${params.inviterName} <${process.env.RESEND_FROM_EMAIL ?? "noreply@toptiertransitions.com"}>`,
    to: params.partnerEmail,
    ...(params.inviterEmail && params.inviterEmail.toLowerCase() !== params.partnerEmail.toLowerCase() ? { cc: [params.inviterEmail], replyTo: params.inviterEmail } : {}),
    subject: `${params.inviterName} invited ${params.companyName} to the Top Tier partner network`,
    html: buildMarketplacePartnerInviteEmail({
      inviterName: params.inviterName,
      partnerName: params.partnerName,
      companyName: params.companyName,
      categoryLabels: params.categoryLabels,
      signUpUrl,
    }),
  });
  if (error) throw new Error(`Invite email failed: ${error.message}`);
}

/** Fires once per (tenant, category) the first time a guided-match search
 * comes back with zero eligible partners — so an empty category generates
 * a concrete follow-up for staff instead of just a client-facing dead end.
 * Phase 5: previously this case had no alert and no demand signal beyond
 * the PartnerRequest record itself. */
export async function sendZeroMatchAdminNotification(params: {
  clientName: string;
  projectName: string;
  tenantId: string;
  category: string;
}): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const adminEmails = await getAdminEmails().catch(() => [] as string[]);
  if (adminEmails.length === 0) return;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim();
  const resend = new Resend(resendKey);
  await resend.emails.send({
    from: `Top Tier Transitions <${process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com"}>`,
    to: adminEmails,
    subject: `No ${params.category} match — ${params.clientName}`,
    html: `<p style="font-family:sans-serif;font-size:14px;color:#374151;">
      <strong>${params.clientName}</strong> (${params.projectName}) asked for a <strong>${params.category}</strong> match and we don't have anyone in their area yet.
      <br /><br />
      <a href="${appUrl}/partners?tenantId=${params.tenantId}">View their request</a> and follow up manually, or use this as a signal to recruit a partner in that area/category.
    </p>`,
  });
}

/** The partner-facing half of an intro request — Phase 5: this used to be
 * built but never sent (see buildPartnerIntroRequestNotificationEmail's
 * original comment). Silently no-ops when the partner has no email on
 * file rather than throwing, since a real amount of partners don't yet
 * (see the Phase 2 backfill notes) — the internal admin notification
 * above still fires either way, so nothing is lost, just not automated
 * for that one partner. */
export async function sendPartnerIntroPartnerNotification(params: {
  vendorName: string;
  vendorEmail?: string;
  clientName: string;
  category: string;
  clientEmail?: string;
  clientPhone?: string;
  answers: Array<{ label: string; value: string }>;
  trackingToken: string;
}): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || !params.vendorEmail) return;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim();
  const html = buildPartnerIntroRequestNotificationEmail({
    vendorName: params.vendorName,
    clientName: params.clientName,
    category: params.category,
    clientEmail: params.clientEmail,
    clientPhone: params.clientPhone,
    answers: params.answers,
    trackedLinkUrl: `${appUrl}/partner-lead/${params.trackingToken}`,
  });

  const resend = new Resend(resendKey);
  await resend.emails.send({
    from: `Top Tier Transitions <${process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com"}>`,
    to: params.vendorEmail,
    subject: `New Client Introduction — ${params.category}`,
    html,
  });
}

/** The TTTAdmin-routed path (the current default for every listing — see
 * Listing.introNotificationMethod): sends the exact same partner-facing
 * content and tracked link to TTT admins instead of the partner, so
 * nothing is silently lost while automated external sends are off — staff
 * can see precisely what would have gone out and relay it manually if
 * they choose to. */
export async function sendPartnerIntroNotificationToAdmins(params: {
  vendorName: string;
  vendorEmail?: string;
  clientName: string;
  category: string;
  clientEmail?: string;
  clientPhone?: string;
  answers: Array<{ label: string; value: string }>;
  trackingToken: string;
}): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const adminEmails = await getAdminEmails().catch(() => [] as string[]);
  if (adminEmails.length === 0) return;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim();
  const html = buildPartnerIntroRequestNotificationEmail({
    vendorName: `${params.vendorName} (routed to TTT admins — partner notifications are off for this listing)`,
    clientName: params.clientName,
    category: params.category,
    clientEmail: params.clientEmail,
    clientPhone: params.clientPhone,
    answers: params.answers,
    trackedLinkUrl: `${appUrl}/partner-lead/${params.trackingToken}`,
  });

  const resend = new Resend(resendKey);
  await resend.emails.send({
    from: `Top Tier Transitions <${process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com"}>`,
    to: adminEmails,
    subject: `[Would go to ${params.vendorName}] New Client Introduction — ${params.category}`,
    html,
  });
}

/** CustomURL path — POSTs the lead to a partner-provided webhook instead
 * of sending an email. Best-effort; a failed POST doesn't block the rest
 * of the intro-request flow. */
export async function postPartnerIntroToCustomUrl(params: {
  url: string;
  vendorName: string;
  clientName: string;
  category: string;
  clientEmail?: string;
  clientPhone?: string;
  answers: Array<{ label: string; value: string }>;
  trackingToken: string;
}): Promise<void> {
  try {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim();
    await fetch(params.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendorName: params.vendorName,
        clientName: params.clientName,
        category: params.category,
        clientEmail: params.clientEmail,
        clientPhone: params.clientPhone,
        answers: params.answers,
        trackedLinkUrl: `${appUrl}/partner-lead/${params.trackingToken}`,
      }),
    });
  } catch (e) {
    console.error("postPartnerIntroToCustomUrl failed:", e);
  }
}

/** The client-facing confirmation half — same Phase 5 note as above. */
export async function sendPartnerIntroClientConfirmation(params: {
  clientEmail?: string;
  clientName: string;
  partnerName: string;
  category: string;
}): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || !params.clientEmail) return;

  const html = buildPartnerIntroConfirmationEmail({
    clientName: params.clientName,
    partnerName: params.partnerName,
    category: params.category,
  });

  const resend = new Resend(resendKey);
  await resend.emails.send({
    from: `Top Tier Transitions <${process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com"}>`,
    to: params.clientEmail,
    subject: `We've reached out to ${params.partnerName}`,
    html,
  });
}

export async function sendScheduleModificationRequest(params: {
  projectName: string;
  tenantId: string;
  requesterName: string;
  requesterEmail: string;
  request: string;
  reason?: string;
  priority: "Normal" | "Urgent";
  planUrl: string;
}): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const staff = await getStaffMembers().catch(() => []);

  const toEmails = staff
    .filter(s => s.isActive && s.email && (s.role === "TTTManager" || s.role === "TTTAdmin"))
    .map(s => s.email as string);

  const adminEmails = await getAdminEmails().catch(() => [] as string[]);
  const allTo = [...new Set([...toEmails, ...adminEmails])];
  if (allTo.length === 0) return;

  const html = buildScheduleModificationEmail({
    projectName: params.projectName,
    requesterName: params.requesterName,
    request: params.request,
    reason: params.reason,
    priority: params.priority,
    planUrl: params.planUrl,
  });

  const resend = new Resend(resendKey);
  const priorityLabel = params.priority === "Urgent" ? " [URGENT]" : "";
  await resend.emails.send({
    from: `Top Tier Transitions <${process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com"}>`,
    to: allTo,
    ...(params.requesterEmail && !allTo.includes(params.requesterEmail.toLowerCase()) ? { cc: [params.requesterEmail] } : {}),
    subject: `${priorityLabel}Schedule Modification Request — ${params.projectName} (${params.requesterName})`,
    html,
  });
}

// ─── Documents feature notifications ───────────────────────────────────────────

// Batches every file from one upload action into a single email to the
// project's Owner. Send failures are logged, never thrown — a notification
// problem must never block or roll back the upload itself.
export async function sendPartnerDocumentSharedNotification(params: {
  tenantId: string;
  partnerName: string;
  companyName?: string;
  fileNames: string[];
  note?: string;
  portalUrl: string;
}): Promise<void> {
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return;

    const memberships = await getMembershipsForTenant(params.tenantId).catch(() => []);
    const ownerIds = memberships.filter(m => m.role === "Owner").map(m => m.userId);
    if (ownerIds.length === 0) return;

    const clerk = await clerkClient();
    const ownerEmails: string[] = [];
    for (const id of ownerIds) {
      const u = await clerk.users.getUser(id).catch(() => null);
      const email = u?.emailAddresses.find(e => e.id === u.primaryEmailAddressId)?.emailAddress ?? u?.emailAddresses[0]?.emailAddress;
      if (email) ownerEmails.push(email);
    }
    if (ownerEmails.length === 0) return;

    const html = buildPartnerDocumentSharedEmail({
      partnerName: params.partnerName,
      companyName: params.companyName,
      fileNames: params.fileNames,
      note: params.note,
      portalUrl: params.portalUrl,
    });

    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: `Top Tier Transitions <${process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com"}>`,
      to: ownerEmails,
      subject: `New document from ${params.partnerName}`,
      html,
    });
  } catch (e) {
    console.error("[sendPartnerDocumentSharedNotification] failed:", e);
  }
}

// A file failed (or couldn't complete) its malware scan — it's quarantined,
// never shown to the Client, and staff needs to review it manually.
export async function sendDocumentQuarantineAlert(params: {
  fileKey: string;
  originalFileName: string;
  partnerName: string;
  tenantId: string;
  detail: string;
}): Promise<void> {
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return;

    const adminEmails = await getAdminEmails().catch(() => [] as string[]);
    if (adminEmails.length === 0) return;

    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: `Top Tier Transitions <${process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com"}>`,
      to: adminEmails,
      subject: `Document quarantined — ${params.originalFileName}`,
      html: `<p>A partner-uploaded document was quarantined and is not visible to the client.</p>
        <p><strong>File:</strong> ${params.originalFileName}</p>
        <p><strong>Partner:</strong> ${params.partnerName}</p>
        <p><strong>Project:</strong> ${params.tenantId}</p>
        <p><strong>Reason:</strong> ${params.detail}</p>
        <p><strong>File key:</strong> ${params.fileKey}</p>`,
    });
  } catch (e) {
    console.error("[sendDocumentQuarantineAlert] failed:", e);
  }
}

// Staff alert on Documents abuse signals (repeated denied access, unusual
// upload volume). Caller (lib/documents.ts's shouldSendAbuseAlert) already
// dedupes so this fires at most once per actor per hour.
export async function sendDocumentAbuseAlert(params: {
  actorUserId: string;
  reason: string;
}): Promise<void> {
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return;

    const adminEmails = await getAdminEmails().catch(() => [] as string[]);
    if (adminEmails.length === 0) return;

    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: `Top Tier Transitions <${process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com"}>`,
      to: adminEmails,
      subject: `Documents abuse alert — ${params.actorUserId}`,
      html: `<p>Possible abuse detected on the Documents feature.</p><p><strong>Actor:</strong> ${params.actorUserId}</p><p><strong>Reason:</strong> ${params.reason}</p>`,
    });
  } catch (e) {
    console.error("[sendDocumentAbuseAlert] failed:", e);
  }
}
