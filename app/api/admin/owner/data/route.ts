import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getTenants,
  getContractsForTenant,
  getInvoicesForTenant,
  getTimeEntriesForTenants,
  getAllActivities,
  getReferralCompanies,
  getReferralContacts,
  getStaffMembers,
  getOpportunities,
  getClientContacts,
  getSoldItems,
} from "@/lib/airtable";
import type { Tenant, Contract, Invoice } from "@/lib/types";
import { ctDateStr } from "@/lib/date-ct";

async function batchContracts(tenants: Tenant[]): Promise<Map<string, Contract[]>> {
  const map = new Map<string, Contract[]>();
  for (let i = 0; i < tenants.length; i += 8) {
    const batch = tenants.slice(i, i + 8);
    const results = await Promise.allSettled(
      batch.map(t => getContractsForTenant(t.id).then(cs => ({ id: t.id, cs })))
    );
    for (const r of results) {
      if (r.status === "fulfilled") map.set(r.value.id, r.value.cs);
    }
  }
  return map;
}

async function batchInvoices(tenants: Tenant[]): Promise<Map<string, Invoice[]>> {
  const map = new Map<string, Invoice[]>();
  for (let i = 0; i < tenants.length; i += 8) {
    const batch = tenants.slice(i, i + 8);
    const results = await Promise.allSettled(
      batch.map(t => getInvoicesForTenant(t.id).then(invs => ({ id: t.id, invs })))
    );
    for (const r of results) {
      if (r.status === "fulfilled") map.set(r.value.id, r.value.invs);
    }
  }
  return map;
}

function grossAmt(inv: Invoice): number {
  if (inv.lineItems?.length) {
    const s = inv.lineItems.filter(li => li.rate > 0).reduce((a, li) => a + li.rate * li.hours, 0);
    if (s > 0) return s;
  }
  return inv.amount;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [allTenants, staffMembers, refCompanies, refContacts, opps, contacts, activities] = await Promise.all([
    getTenants().catch(() => [] as Tenant[]),
    getStaffMembers().catch(() => []),
    getReferralCompanies().catch(() => []),
    getReferralContacts().catch(() => []),
    getOpportunities().catch(() => []),
    getClientContacts().catch(() => []),
    getAllActivities().catch(() => []),
  ]);

  const tttTenants = allTenants.filter(t => t.isTTT !== false);
  const tenantIds = tttTenants.map(t => t.id);

  // Sequential to avoid Airtable rate-limit exhaustion
  const contractsByTenant = await batchContracts(tttTenants);
  const invoicesByTenant  = await batchInvoices(tttTenants);
  const [timeEntries, soldItems] = await Promise.all([
    getTimeEntriesForTenants(tenantIds).catch(() => []),
    getSoldItems().catch(() => []),
  ]);

  // Build lookup maps
  const contactMap   = new Map(contacts.map(c => [c.id, c]));
  const refContactByIdMap = new Map(refContacts.map(c => [c.id, c]));

  // Best opp per tenant → sales rep + referral contact
  const salesRepByTenant = new Map<string, string>();
  const refContactByTenant = new Map<string, string>();

  for (const opp of opps) {
    if (!opp.tenantId) continue;
    const existing = salesRepByTenant.get(opp.tenantId);
    if (!existing || opp.stage === "Won") {
      if (opp.assignedToClerkId) salesRepByTenant.set(opp.tenantId, opp.assignedToClerkId);
      const cc = contactMap.get(opp.clientContactId);
      if (cc?.referralPartnerId) refContactByTenant.set(opp.tenantId, cc.referralPartnerId);
    }
  }

  // Activity → referral contact/company (via opp → clientContact or direct clientContactId)
  const oppToClientContact = new Map(opps.map(o => [o.id, o.clientContactId]));

  // ── Flatten data ──────────────────────────────────────────────────────────────

  const signedContracts = [];
  for (const [tenantId, cs] of contractsByTenant) {
    for (const c of cs) {
      if (c.status !== "Signed" || !c.signedAt) continue;
      const refCid = refContactByTenant.get(tenantId) ?? null;
      const refCo  = refCid ? (refContactByIdMap.get(refCid)?.referralCompanyId ?? null) : null;
      signedContracts.push({
        id: c.id,
        tenantId,
        signedAt: ctDateStr(c.signedAt),
        totalCost: c.totalCost,
        salesRepClerkId: salesRepByTenant.get(tenantId) ?? null,
        referralContactId: refCid,
        referralCompanyId: refCo,
      });
    }
  }

  const invoicesFlat = [];
  for (const [tenantId, invs] of invoicesByTenant) {
    for (const inv of invs) {
      if (!inv.createdAt || inv.type === "Deposit") continue;
      const refCid = refContactByTenant.get(tenantId) ?? null;
      const refCo  = refCid ? (refContactByIdMap.get(refCid)?.referralCompanyId ?? null) : null;
      invoicesFlat.push({
        id: inv.id,
        tenantId,
        date: ctDateStr(inv.createdAt),
        amount: grossAmt(inv),
        salesRepClerkId: salesRepByTenant.get(tenantId) ?? null,
        referralContactId: refCid,
        referralCompanyId: refCo,
      });
    }
  }

  const timeFlat = timeEntries
    .filter(e => e.date)
    .map(e => ({
      date: e.date,
      durationMinutes: e.durationMinutes,
      staffClerkId: e.clerkUserId ?? null,
      staffName: e.staffName ?? null,
      tenantId: e.tenantId,
      salesRepClerkId: salesRepByTenant.get(e.tenantId) ?? null,
    }));

  const activitiesFlat = activities
    .filter(a => a.activityDate)
    .map(a => {
      const ccId = a.clientContactId || (a.opportunityId ? oppToClientContact.get(a.opportunityId) : undefined);
      const cc = ccId ? contactMap.get(ccId) : undefined;
      const refCid = cc?.referralPartnerId ?? null;
      const refCo  = refCid ? (refContactByIdMap.get(refCid)?.referralCompanyId ?? null) : null;
      return {
        date: ctDateStr(a.activityDate),
        type: a.type,
        createdByClerkId: a.createdByClerkId,
        referralContactId: refCid,
        referralCompanyId: refCo,
      };
    });

  // ── Opportunities ─────────────────────────────────────────────────────────────
  const oppsFlat = opps
    .filter(o => o.createdAt)
    .map(o => {
      const cc = contactMap.get(o.clientContactId);
      const refCid = cc?.referralPartnerId ?? null;
      const refCo  = refCid ? (refContactByIdMap.get(refCid)?.referralCompanyId ?? null) : null;
      return {
        id: o.id,
        createdAt:      ctDateStr(o.createdAt),
        wonAt:          o.wonAt     ? ctDateStr(o.wonAt)  : null,
        lostAt:         o.lostAt    ? ctDateStr(o.lostAt) : null,
        stage:          o.stage,
        estimatedValue: o.estimatedValue ?? 0,
        lostReason:     o.lostReason ?? null,
        salesRepClerkId: o.assignedToClerkId ?? null,
        referralContactId: refCid,
        referralCompanyId: refCo,
      };
    });

  const soldFlat = soldItems
    .filter(item => item.saleDate && (item.salePrice ?? 0) > 0)
    .map(item => {
      const companyTake = (item.salePrice ?? 0) - (item.consignorPayout ?? 0);
      const channel =
        item.saleChannel
          ? item.saleChannel
          : item.primaryRoute === "FB/Marketplace"
          ? "Facebook"
          : item.primaryRoute === "Online Marketplace"
          ? "eBay / Online"
          : item.primaryRoute === "Estate Sale"
          ? "Estate Sale"
          : item.primaryRoute === "ProFoundFinds Consignment"
          ? "ProFound"
          : (item.primaryRoute as string) ?? "Other";
      return {
        saleDate: item.saleDate!,
        salePrice: item.salePrice ?? 0,
        companyTake: Math.max(0, companyTake),
        channel,
        staffSellerId: item.staffSellerId ?? null,
        salesRepClerkId: item.tenantId ? (salesRepByTenant.get(item.tenantId) ?? null) : null,
      };
    });

  return NextResponse.json({
    salesReps: staffMembers
      .filter(s => ["TTTSales", "TTTManager", "TTTAdmin"].includes(s.role))
      .map(s => ({ id: s.clerkUserId, name: s.displayName })),
    staff: staffMembers
      .filter(s => s.isActive)
      .map(s => ({ id: s.clerkUserId, name: s.displayName })),
    referralCompanies: refCompanies.map(c => ({ id: c.id, name: c.name })),
    referralContacts: refContacts.map(c => ({
      id: c.id,
      name: c.name,
      companyId: c.referralCompanyId ?? null,
      stage: c.stage ?? null,
    })),
    signedContracts,
    invoices: invoicesFlat,
    timeEntries: timeFlat,
    activities: activitiesFlat,
    soldItems: soldFlat,
    opportunities: oppsFlat,
  });
}
