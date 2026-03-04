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

  if (tenantId) {
    // Single-tenant mode
    const { getTenantById } = await import("@/lib/airtable");
    const [tenant, items] = await Promise.all([
      getTenantById(tenantId).catch(() => null),
      getItemsForTenant(tenantId).catch(() => []),
    ]);
    const projectZip = tenant?.zip ?? "";
    const assignments = applyRoutingRules(items, vendors, activeRules, projectZip);
    for (const { itemId, vendorId } of assignments) {
      await updateItem(itemId, { assignedVendorId: vendorId, vendorDecision: "Pending" });
      assigned++;
    }
  } else {
    // All active tenants
    const tenants = await getTenants().catch(() => []);
    const activeTenants = tenants.filter(t => !t.isArchived);
    for (const tenant of activeTenants) {
      const items = await getItemsForTenant(tenant.id).catch(() => []);
      const projectZip = tenant.zip ?? "";
      const assignments = applyRoutingRules(items, vendors, activeRules, projectZip);
      for (const { itemId, vendorId } of assignments) {
        await updateItem(itemId, { assignedVendorId: vendorId, vendorDecision: "Pending" });
        assigned++;
      }
    }
  }

  return NextResponse.json({ assigned });
}
