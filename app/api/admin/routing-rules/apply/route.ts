import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getTenants,
  getItemsForTenant,
  getAllLocalVendors,
  getRoutingRules,
  applyRoutingRules,
  updateItem,
} from "@/lib/airtable";
import { buildVendorAssignmentEmail } from "@/lib/email";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!sysRole || !["TTTAdmin", "TTTManager"].includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");

  const [rules, vendors] = await Promise.all([
    getRoutingRules().catch(() => []),
    getAllLocalVendors().catch(() => []),
  ]);

  const activeRules = rules.filter(r => r.isActive);
  if (activeRules.length === 0) {
    return NextResponse.json({ assigned: 0, message: "No active routing rules" });
  }

  let assigned = 0;
  // Track new assignments per vendor: vendorId -> count
  const vendorAssignmentCounts = new Map<string, number>();

  const processAssignments = async (assignments: Array<{ itemId: string; vendorId: string }>) => {
    for (const { itemId, vendorId } of assignments) {
      await updateItem(itemId, { assignedVendorId: vendorId, vendorDecision: "Pending" });
      assigned++;
      vendorAssignmentCounts.set(vendorId, (vendorAssignmentCounts.get(vendorId) ?? 0) + 1);
    }
  };

  if (tenantId) {
    // Single-tenant mode
    const { getTenantById } = await import("@/lib/airtable");
    const [tenant, items] = await Promise.all([
      getTenantById(tenantId).catch(() => null),
      getItemsForTenant(tenantId).catch(() => []),
    ]);
    const projectZip = tenant?.zip ?? "";
    const assignments = applyRoutingRules(items, vendors, activeRules, projectZip);
    await processAssignments(assignments);
  } else {
    // All active tenants
    const tenants = await getTenants().catch(() => []);
    const activeTenants = tenants.filter(t => !t.isArchived);
    for (const tenant of activeTenants) {
      const items = await getItemsForTenant(tenant.id).catch(() => []);
      const projectZip = tenant.zip ?? "";
      const assignments = applyRoutingRules(items, vendors, activeRules, projectZip);
      await processAssignments(assignments);
    }
  }

  // Send notification emails to each vendor with new assignments
  const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com"}/vendor`;
  for (const [vendorId, itemCount] of vendorAssignmentCounts) {
    const vendor = vendors.find(v => v.id === vendorId);
    if (!vendor?.email) continue;
    try {
      await resend.emails.send({
        from: "Top Tier Transitions <noreply@toptiertransitions.com>",
        to: vendor.email,
        subject: `${itemCount} new item${itemCount === 1 ? "" : "s"} waiting for your review`,
        html: buildVendorAssignmentEmail({ vendorName: vendor.vendorName, itemCount, portalUrl }),
      });
    } catch (err) {
      console.error(`Failed to send notification to vendor ${vendorId}:`, err);
    }
  }

  return NextResponse.json({ assigned });
}
