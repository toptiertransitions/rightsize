import { clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { getStaffMembers, getReferralCompanyById, getActivitiesForContact, getOpportunitiesForTenant, getClientContactById } from "./airtable";
import { isTTTAdmin } from "./config";
import { buildNewUserAdminEmail, buildStageProgressEmail, buildActiveReferralCelebrationEmail, buildQuoteAlertEmail, buildNewVendorAdminEmail } from "./email";
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

  const html = buildQuoteAlertEmail({
    clientName,
    clientEmail: contact?.email,
    referralSource: contact?.source,
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
