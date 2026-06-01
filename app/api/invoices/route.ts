import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getUserRoleForTenant,
  getInvoicesForTenant,
  getAllInvoiceCount,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  getAllServices,
  getInvoiceSettings,
  getOpportunitiesForTenant,
  createPartnerPoint,
  markInvoicePartnerPointAwarded,
  getClientContactById,
  getReferralContactById,
  getTenantById,
} from "@/lib/airtable";
import { AIRTABLE_TABLES } from "@/lib/config";
import { createQBOInvoice } from "@/lib/qbo";
import { buildInvoiceEmail } from "@/lib/email";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  const tenantRole = sysRole ? null : await getUserRoleForTenant(userId, tenantId).catch(() => null);
  const role = sysRole || tenantRole;
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const invoices = await getInvoicesForTenant(tenantId);
  return NextResponse.json({ invoices });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !["TTTSales", "TTTManager", "TTTAdmin"].includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    tenantId,
    type,
    serviceId,
    serviceName,
    depositType,
    depositPercent,
    amount,
    contractId,
    lineItems,
    expenseItems,
    pushToQBO,
    sendEmail,
    sentToEmail,
    ccEmail,
    tenantName,
    customerName,
  } = body;

  if (!tenantId || !type || !amount) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Generate invoice number
  const count = await getAllInvoiceCount().catch(() => 0);
  const invoiceNumber = `INV-${String(count + 1).padStart(4, "0")}`;

  let qboInvoiceId: string | undefined;
  let qboDocNumber: string | undefined;
  let qboError: string | undefined;

  // Push to QBO if requested
  if (pushToQBO) {
    try {
      const services = await getAllServices().catch(() => []);
      const serviceMap = new Map(services.map((s) => [s.id, s]));

      let qboLineItems: Array<{ serviceName: string; hours: number; rate: number; qboItemId?: string }>;

      if (type === "Deposit") {
        // Deposit: single line item with qty=1, rate=amount
        const svc = serviceMap.get(serviceId);
        qboLineItems = [{
          serviceName: serviceName || "Deposit",
          hours: 1,
          rate: amount,
          qboItemId: svc?.qboItemId,
        }];
      } else {
        // Full: build from explicit lineItems, or fall back to a single line for "specific amount" invoices
        if (lineItems && lineItems.length > 0) {
          qboLineItems = lineItems.map((item: { serviceId: string; serviceName: string; hours: number; rate: number }) => ({
            serviceName: item.serviceName,
            hours: item.hours,
            rate: item.rate,
            qboItemId: serviceMap.get(item.serviceId)?.qboItemId,
          }));
        } else {
          // Specific-amount invoice with no explicit line items — create a single line
          const svc = serviceMap.get(serviceId);
          qboLineItems = [{
            serviceName: serviceName || "Services",
            hours: 1,
            rate: amount,
            qboItemId: svc?.qboItemId,
          }];
        }

        // Append expense items as additional line items
        if (expenseItems && expenseItems.length > 0) {
          for (const ei of expenseItems as Array<{ vendor: string; description: string; date: string; amount: number }>) {
            qboLineItems.push({
              serviceName: ei.vendor || "Expense",
              hours: 1,
              rate: ei.amount,
            });
          }
        }
      }

      const qboResult = await createQBOInvoice({
        customerName: customerName || tenantName || "Client",
        lineItems: qboLineItems,
        memo: `Invoice ${invoiceNumber}`,
      });
      qboInvoiceId = qboResult.id;
      qboDocNumber = qboResult.docNumber;
    } catch (e) {
      console.error("QBO invoice creation failed:", e);
      qboError = e instanceof Error ? e.message : "QBO invoice creation failed";
    }
  }

  // Create invoice first so we have the ID for the payment URL
  let invoice = await createInvoice({
    tenantId,
    type,
    invoiceNumber,
    serviceId: serviceId || "",
    serviceName: serviceName || "",
    depositType,
    depositPercent,
    amount,
    contractId,
    lineItems,
    expenseItems: expenseItems?.length ? expenseItems : undefined,
    qboInvoiceId,
    qboDocNumber,
    sentToEmail,
    ccEmail,
    emailSent: false,
    createdByClerkId: userId,
  });

  // Send email with a link back to the platform payment page.
  // Only fires when "Send Email" is explicitly checked — not when pushing to QBO
  // (QBO sends its own email with its payment link).
  if (sendEmail && sentToEmail) {
    try {
      const settings = await getInvoiceSettings().catch(() => null);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
      const payUrl = `${appUrl}/pay/${invoice.id}`;
      const html = buildInvoiceEmail({
        invoiceNumber,
        tenantName: tenantName || "Client",
        type,
        amount,
        serviceName: serviceName || "Services",
        payUrl,
        companyName: settings?.companyName || "Top Tier Transitions",
        logoUrl: settings?.logoUrl,
        lineItems: lineItems ?? undefined,
      });
      const emailOpts: Parameters<typeof resend.emails.send>[0] = {
        from: process.env.RESEND_FROM_EMAIL || "invoices@yourdomain.com",
        to: sentToEmail,
        subject: `Invoice ${invoiceNumber} — ${type} Invoice`,
        html,
      };
      if (ccEmail) emailOpts.cc = ccEmail;
      await resend.emails.send(emailOpts);
      invoice = await updateInvoice(invoice.id, { emailSent: true });
    } catch (e) {
      console.error("Invoice email send failed:", e);
    }
  }

  return NextResponse.json({ invoice, ...(qboError ? { qboError } : {}) });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !["TTTManager", "TTTAdmin", "TTTSales"].includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id, status, paidAmount, paidAt, notes, sendEmail, sentToEmail, ccEmail } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  let invoice = await updateInvoice(id, { status, paidAmount, paidAt, notes, sentToEmail, ccEmail });

  // Auto-award partner point when invoice is first marked Paid (idempotent via PartnerPointAwarded flag)
  if (status === "Paid" && invoice.tenantId) {
    autoAwardPartnerPoint(invoice.id, invoice.tenantId).catch(() => {});
  }

  // Send email for existing invoice if requested
  if (sendEmail && sentToEmail) {
    try {
      const settings = await getInvoiceSettings().catch(() => null);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
      const payUrl = `${appUrl}/pay/${invoice.id}`;
      const html = buildInvoiceEmail({
        invoiceNumber: invoice.invoiceNumber,
        tenantName: "Client",
        type: invoice.type,
        amount: invoice.amount,
        serviceName: invoice.serviceName || "Services",
        payUrl,
        companyName: settings?.companyName || "Top Tier Transitions",
        logoUrl: settings?.logoUrl,
        lineItems: invoice.lineItems ?? undefined,
      });
      const emailOpts: Parameters<typeof resend.emails.send>[0] = {
        from: process.env.RESEND_FROM_EMAIL || "invoices@yourdomain.com",
        to: sentToEmail,
        subject: `Invoice ${invoice.invoiceNumber} — ${invoice.type} Invoice`,
        html,
      };
      if (ccEmail) emailOpts.cc = ccEmail;
      await resend.emails.send(emailOpts);
      invoice = await updateInvoice(invoice.id, { emailSent: true });
    } catch (e) {
      console.error("Invoice email send failed:", e);
    }
  }

  return NextResponse.json({ invoice });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !["TTTSales", "TTTManager", "TTTAdmin"].includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await deleteInvoice(id);
  return NextResponse.json({ ok: true });
}

// ─── Partner Point Auto-Award ─────────────────────────────────────────────────
// Looks up the referring partner for this tenant's opportunity and awards a point.
// The PartnerPointAwarded flag on the invoice prevents double-awarding.
async function autoAwardPartnerPoint(invoiceId: string, tenantId: string): Promise<void> {
  // Check if already awarded (re-read the invoice raw to avoid stale cache)
  const token = process.env.AIRTABLE_API_TOKEN!;
  const baseId = process.env.AIRTABLE_BASE_ID!;
  const checkRes = await fetch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(AIRTABLE_TABLES.INVOICES)}/${invoiceId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!checkRes.ok) return;
  const invoiceRecord = await checkRes.json();
  if (invoiceRecord.fields?.PartnerPointAwarded) return;

  // Find the won opportunity for this tenant to get the referral partner
  const opps = await getOpportunitiesForTenant(tenantId).catch(() => []);
  const wonOpp = opps.find((o) => o.stage === "Won");
  if (!wonOpp) return;

  // Get the client contact to find the referral partner
  const [clientContact, tenant] = await Promise.all([
    getClientContactById(wonOpp.clientContactId).catch(() => null),
    getTenantById(tenantId).catch(() => null),
  ]);
  if (!clientContact?.referralPartnerId) return;

  // Award the legacy point
  await createPartnerPoint({
    referralContactId: clientContact.referralPartnerId,
    tenantId,
    tenantName: tenant?.name,
    opportunityId: wonOpp.id,
  });

  // Also award loyalty program point (non-blocking)
  awardLoyaltyPoint(clientContact.referralPartnerId, tenantId).catch(
    e => console.error("[loyalty] award failed:", e)
  );

  // Mark invoice so this doesn't happen again
  await markInvoicePartnerPointAwarded(invoiceId);
}

// ─── Loyalty point award (called inline, non-blocking) ────────────────────────
async function awardLoyaltyPoint(referralContactAirtableId: string, tenantId: string): Promise<void> {
  const { getLoyaltyRecord, createLoyaltyRecord, updateLoyaltyRecord, createLedgerEntry } = await import("@/lib/airtable-loyalty");
  const { getTierForPoints, getTierIndex, getCurrentProgramYear, isProgramYearReset, TIERS } = await import("@/lib/loyalty");
  const { getReferralCompanyById } = await import("@/lib/airtable");

  const referralContact = await getReferralContactById(referralContactAirtableId).catch(() => null);
  if (!referralContact?.clerkUserId) return;

  const programYear = getCurrentProgramYear();
  const now = new Date().toISOString();

  // Resolve to company-level key so all contacts at the same firm share one record
  const companyId = referralContact.referralCompanyId || null;
  const company = companyId ? await getReferralCompanyById(companyId).catch(() => null) : null;
  const loyaltyKey = companyId || referralContact.clerkUserId;
  const companyName = company?.name || referralContact.name || loyaltyKey;

  let record = await getLoyaltyRecord(loyaltyKey);

  if (!record) {
    record = await createLoyaltyRecord({
      partnerId: loyaltyKey,
      partnerName: referralContact.name,
      partnerEmail: referralContact.email,
      companyName,
      currentTier: "None",
      currentYearPoints: 0,
      lifetimePoints: 0,
      currentProgramYear: programYear,
      currentMultiplier: 1,
      silverBonusApplied: false,
    });
  }

  if (isProgramYearReset(record.currentProgramYear)) {
    await createLedgerEntry({
      partnerId: loyaltyKey, companyName: record.companyName,
      eventType: "year_reset",
      pointsDelta: -record.currentYearPoints,
      pointsBalanceAfter: record.lifetimePoints - record.currentYearPoints,
      tierBefore: record.currentTier, tierAfter: record.currentTier,
      note: `Year reset: ${record.currentProgramYear} → ${programYear}`,
      createdAt: now, programYear,
    });
    record = await updateLoyaltyRecord(record.id, { currentYearPoints: 0, currentProgramYear: programYear });
  }

  const tierBefore = record.currentTier;
  const pointsToAward = 1 * record.currentMultiplier;
  let newYearPoints = record.currentYearPoints + pointsToAward;
  let newLifetimePoints = record.lifetimePoints + pointsToAward;
  let newTier = record.currentTier;
  let newMultiplier = record.currentMultiplier;

  const newTierData = getTierForPoints(newYearPoints);
  if (getTierIndex(newTierData.name) > getTierIndex(record.currentTier)) {
    newTier = newTierData.name;
    newMultiplier = newTierData.multiplier;
  }

  let silverBonusApplied = record.silverBonusApplied;
  if (!silverBonusApplied && newYearPoints >= TIERS[1].threshold) {
    const balanceAfterBonus = newLifetimePoints + 5;
    newYearPoints += 5;
    newLifetimePoints += 5;
    silverBonusApplied = true;
    const bonusTier = getTierForPoints(newYearPoints);
    if (getTierIndex(bonusTier.name) > getTierIndex(newTier)) {
      newTier = bonusTier.name;
      newMultiplier = bonusTier.multiplier;
    }
    await createLedgerEntry({
      partnerId: loyaltyKey, companyName, eventType: "silver_one_time_bonus",
      pointsDelta: 5, pointsBalanceAfter: balanceAfterBonus,
      tierBefore, tierAfter: newTier,
      note: "One-time Silver milestone bonus", createdAt: now, programYear,
    });
  }

  await createLedgerEntry({
    partnerId: loyaltyKey, companyName, eventType: "project_completed",
    pointsDelta: pointsToAward, pointsBalanceAfter: newLifetimePoints,
    tierBefore, tierAfter: newTier,
    relatedProjectId: tenantId,
    note: "Completed project referral", createdAt: now, programYear,
  });

  const statusEarnedYear = newTier !== tierBefore ? programYear : record.statusEarnedYear;
  await updateLoyaltyRecord(record.id, {
    partnerName: referralContact.name,
    partnerEmail: referralContact.email,
    companyName,
    currentTier: newTier,
    currentYearPoints: newYearPoints,
    lifetimePoints: newLifetimePoints,
    currentMultiplier: newMultiplier,
    silverBonusApplied,
    statusEarnedYear,
  });
}
