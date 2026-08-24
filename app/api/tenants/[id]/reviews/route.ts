import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Resend } from "resend";
import {
  getSystemRole,
  getReviewsForTenant,
  createGoogleReview,
  getTenantById,
  getOpportunitiesForTenant,
  getClientContactById,
  getReferralContactById,
  getReferralCompanyById,
  getTimeEntries,
  getStaffMembers,
} from "@/lib/airtable";
import { isTTTAdmin } from "@/lib/config";
import { buildGoogleReviewNotificationEmail } from "@/lib/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const reviews = await getReviewsForTenant(id).catch(() => []);
  return NextResponse.json({ reviews });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!["TTTManager", "TTTAdmin"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: { stars: number; text: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const stars = Number(body.stars);
  if (!stars || stars < 1 || stars > 5 || !body.text?.trim()) {
    return NextResponse.json({ error: "stars (1–5) and text are required" }, { status: 400 });
  }

  let review;
  try {
    review = await createGoogleReview(id, stars, body.text.trim());
  } catch (e) {
    console.error("[reviews POST] Airtable error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  // Send internal notification (non-blocking on error)
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const [tenant, opportunities, timeEntries, allStaff] = await Promise.all([
        getTenantById(id).catch(() => null),
        getOpportunitiesForTenant(id).catch(() => []),
        getTimeEntries({ tenantId: id }).catch(() => []),
        getStaffMembers().catch(() => []),
      ]);

      const projectName = tenant?.name ?? "Unknown Project";

      // Seller = TTT sales user who owns the Won opportunity (fallback to first opp)
      const wonOpp = opportunities.find(o => o.stage === "Won") ?? opportunities[0] ?? null;
      const sellerName = wonOpp?.assignedToClerkId
        ? (allStaff.find(s => s.clerkUserId === wonOpp.assignedToClerkId)?.displayName || undefined)
        : undefined;

      // Team lead from staff list
      const teamLeadName = tenant?.teamLeadClerkId
        ? (allStaff.find(s => s.clerkUserId === tenant.teamLeadClerkId)?.displayName || undefined)
        : undefined;

      // Team members who billed hours (unique names, exclude non-billable)
      const teamMemberNames = [
        ...new Set(timeEntries.filter(e => !e.nonBillable).map(e => e.staffName).filter(Boolean)),
      ] as string[];

      // Referral partner — Won opp → client contact → referral contact → company
      let referralPartnerName: string | undefined;
      let referralCompanyName: string | undefined;
      if (wonOpp?.clientContactId) {
        const contact = await getClientContactById(wonOpp.clientContactId).catch(() => null);
        if (contact?.referralPartnerId) {
          const refContact = await getReferralContactById(contact.referralPartnerId).catch(() => null);
          if (refContact) {
            referralPartnerName = refContact.name || undefined;
            if (refContact.referralCompanyId) {
              const company = await getReferralCompanyById(refContact.referralCompanyId).catch(() => null);
              referralCompanyName = company?.name || undefined;
            }
          }
        }
      }

      // Recipients: TTTSales + TTTManager + TTTAdmin + the project's team lead (active, with email)
      const teamLeadEmail = tenant?.teamLeadClerkId
        ? (allStaff.find(s => s.clerkUserId === tenant.teamLeadClerkId && s.isActive && s.email)?.email ?? null)
        : null;
      const recipientSet = new Set<string>(
        allStaff
          .filter(s => s.isActive && s.email && (
            ["TTTAdmin", "TTTManager", "TTTSales"].includes(s.role ?? "") || isTTTAdmin(s.clerkUserId)
          ))
          .map(s => s.email as string)
      );
      if (teamLeadEmail) recipientSet.add(teamLeadEmail);
      const recipients = [...recipientSet];

      if (recipients.length > 0) {
        const planUrl = `${APP_URL}/plan?tenantId=${id}`;
        const html = buildGoogleReviewNotificationEmail({
          projectName,
          stars,
          reviewText: body.text.trim(),
          sellerName,
          referralPartnerName,
          referralCompanyName,
          teamLeadName,
          teamMemberNames,
          planUrl,
        });

        const resend = new Resend(resendKey);
        const { error: sendError } = await resend.emails.send({
          from: "Rightsize Alerts <notifications@toptiertransitions.com>",
          to: recipients,
          subject: `New Google Review — ${projectName}`,
          html,
        });
        if (sendError) {
          console.error("[reviews POST] notification Resend error:", sendError);
        } else {
          console.log(`[reviews POST] review notification sent to ${recipients.length} recipient(s) for "${projectName}"`);
        }
      }
    } catch (e) {
      console.error("[reviews POST] notification failed:", e);
    }
  }

  return NextResponse.json({ review }, { status: 201 });
}
