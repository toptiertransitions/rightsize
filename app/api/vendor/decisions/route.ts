import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getLocalVendorByClerkId, updateItem } from "@/lib/airtable";
import type { VendorDecision } from "@/lib/types";

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { itemId: string; decision: VendorDecision; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { itemId, decision, notes } = body;
  if (!itemId || !decision) {
    return NextResponse.json({ error: "Missing itemId or decision" }, { status: 400 });
  }
  if (!["Pending", "Approved", "Rejected", "Hold"].includes(decision)) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  const vendor = await getLocalVendorByClerkId(userId).catch(() => null);
  if (!vendor) {
    return NextResponse.json({ error: "Vendor not found" }, { status: 403 });
  }

  // Update the item — security: only update vendorDecision/vendorNotes
  // The API trusts that the item belongs to this vendor (verified by the query in the portal)
  const updated = await updateItem(itemId, {
    vendorDecision: decision,
    vendorNotes: notes ?? undefined,
  });

  // Verify the item is actually assigned to this vendor
  if (updated.assignedVendorId !== vendor.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ success: true });
}
