export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import {
  getSystemRole,
  getReferralContactById,
  getReferralCompanyById,
  getPartnerPointsByCompany,
  getPartnerPoints,
  getReviewsForTenant,
  getPartnerTenantIdsByCompany,
  getTenantById,
} from "@/lib/airtable";
import { getPartnerProjectsByStage } from "@/lib/partner";
import { buildPartnerRewardsEmail } from "@/lib/email";
import type { PartnerPoint, GoogleReview } from "@/lib/types";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { referralContactId } = await req.json();
  if (!referralContactId) return NextResponse.json({ error: "Missing referralContactId" }, { status: 400 });

  // Get the logged-in user's email
  const clerk = await clerkClient();
  const senderUser = await clerk.users.getUser(userId).catch(() => null);
  const toEmail = senderUser?.emailAddresses?.[0]?.emailAddress;
  if (!toEmail) return NextResponse.json({ error: "Could not determine sender email" }, { status: 400 });

  // Fetch the referral contact
  const contact = await getReferralContactById(referralContactId).catch(() => null);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const companyId = contact.referralCompanyId || null;

  const [projectsByStage, points, company] = await Promise.all([
    getPartnerProjectsByStage(contact).catch(() => [] as { tenantId: string; stage: string }[]),
    companyId
      ? getPartnerPointsByCompany(companyId).catch(() => [] as PartnerPoint[])
      : getPartnerPoints(contact.id).catch(() => [] as PartnerPoint[]),
    companyId ? getReferralCompanyById(companyId).catch(() => null) : Promise.resolve(null),
  ]);

  const tenants = await Promise.all(
    projectsByStage.map(({ tenantId }) => getTenantById(tenantId).catch(() => null))
  );

  const wonTenantIds = projectsByStage.filter(p => p.stage === "Won").map(p => p.tenantId);
  const allLinkedTenantIds = companyId
    ? await getPartnerTenantIdsByCompany(companyId).catch(() => [] as string[])
    : wonTenantIds;
  const reviewTenantIds = Array.from(new Set([...wonTenantIds, ...allLinkedTenantIds]));

  const [reviewArrays, reviewTenants] = await Promise.all([
    Promise.all(reviewTenantIds.map(id => getReviewsForTenant(id).catch(() => [] as GoogleReview[]))),
    Promise.all(reviewTenantIds.map(id => getTenantById(id).catch(() => null))),
  ]);
  const tenantNameById: Record<string, string> = {};
  reviewTenants.forEach((t, i) => { if (t) tenantNameById[reviewTenantIds[i]] = t.name; });
  const recentReviews = reviewArrays
    .flatMap((arr, i) => arr.map(r => ({ ...r, tenantName: tenantNameById[reviewTenantIds[i]] ?? "" })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  const enriched = projectsByStage
    .map(({ tenantId, stage }, i) => {
      const t = tenants[i];
      if (!t) return null;
      return { name: t.name, address: t.address, city: t.city, state: t.state, isArchived: t.isArchived, stage };
    })
    .filter(Boolean) as Array<{ name: string; address?: string; city?: string; state?: string; isArchived: boolean; stage: string }>;

  const currentProjects  = enriched.filter(p => p.stage === "Won" && !p.isArchived);
  const potentialProjects = enriched.filter(p => p.stage === "Proposing" && !p.isArchived);
  const previousProjects  = enriched.filter(p => p.stage === "Won" && p.isArchived);

  const earned    = points.length;
  const redeemed  = points.filter(p => p.redeemedAt).length;
  const available = earned - redeemed;

  const companyName = company?.name || contact.name;
  const isInvited = !!contact.clerkUserId;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";

  const html = buildPartnerRewardsEmail({
    companyName,
    pointsAvailable: available,
    pointsEarned: earned,
    pointsRedeemed: redeemed,
    currentProjects,
    potentialProjects,
    previousProjects,
    recentReviews: recentReviews.map(r => ({ stars: r.stars, text: r.text, tenantName: r.tenantName })),
    isInvited,
    appUrl,
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "hello@rightsize.app";

  await resend.emails.send({
    from: `Top Tier Transitions <${fromEmail}>`,
    to: toEmail,
    subject: `Partner Rewards Summary — ${companyName}`,
    html,
  });

  return NextResponse.json({ ok: true });
}
