import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getRoutingRules, getAllLocalVendors, applyRoutingRules, getTenantById } from "@/lib/airtable";
import type { Item } from "@/lib/types";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { valueMid, sizeClass, condition, category, fragility, tenantId } = await req.json();

  if (!sizeClass) {
    return NextResponse.json({ primaryRoute: null });
  }

  const [routingRules, localVendors, tenant] = await Promise.all([
    getRoutingRules().catch(() => []),
    getAllLocalVendors().catch(() => []),
    tenantId ? getTenantById(tenantId).catch(() => null) : Promise.resolve(null),
  ]);

  const activeRules = routingRules.filter(r => r.isActive);
  if (activeRules.length === 0) {
    return NextResponse.json({ primaryRoute: null });
  }

  const mockItem = {
    id: "__preview__",
    status: "Pending Review",
    sizeClass: sizeClass ?? "",
    condition: condition ?? "Good",
    valueMid: valueMid ?? 0,
    category: category ?? "",
    fragility: fragility ?? "Not Fragile",
    assignedVendorId: undefined,
  } as unknown as Item;

  const assignments = applyRoutingRules([mockItem], localVendors, activeRules, "", tenant?.isEstateSale ?? false);
  const primaryRoute = assignments[0]?.primaryRoute ?? null;

  return NextResponse.json({ primaryRoute });
}
