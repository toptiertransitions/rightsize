import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { getLocalVendorByClerkId, updateItem, getVendorOutreach, getTenantById, getItemById } from "@/lib/airtable";
import { buildVendorClaimNotificationEmail } from "@/lib/email";
import type { VendorDecision } from "@/lib/types";

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { itemId: string; decision: VendorDecision; notes?: string; vendorExpectedPrice?: number; vendorPriceNote?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { itemId, decision, notes, vendorExpectedPrice, vendorPriceNote } = body;
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

  const updateData: Parameters<typeof updateItem>[1] = {
    vendorDecision: decision,
    vendorNotes: (vendorPriceNote ?? notes) || undefined,
    vendorPriceApproved: decision === "Approved" ? true : undefined,
    vendorRespondedAt: new Date().toISOString(),
    ...(decision === "Approved" ? { primaryRoute: "Other Consignment" } : {}),
  };
  if (vendorExpectedPrice !== undefined) {
    updateData.vendorExpectedPrice = vendorExpectedPrice;
  }

  // For Approved via vendor portal, also set outreach fields
  if (decision === "Approved") {
    updateData.claimedByVendorId = vendor.id;
    updateData.vendorOutreachStatus = "Claimed";
  }

  const updated = await updateItem(itemId, updateData);

  if (updated.assignedVendorId !== vendor.id && updated.currentVendorId !== vendor.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fire claim notification for Approved decisions
  if (decision === "Approved") {
    try {
      const item = await getItemById(itemId).catch(() => null);
      if (item?.tenantId) {
        const [outreachRecords, tenant] = await Promise.all([
          getVendorOutreach(item.tenantId).catch(() => []),
          getTenantById(item.tenantId).catch(() => null),
        ]);
        const relevant = outreachRecords.find(r => r.vendorAirtableId === vendor.id);
        if (relevant?.sentByEmail) {
          const resend = new Resend(process.env.RESEND_API_KEY);
          const fromEmail = process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com";
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
          await resend.emails.send({
            from: `Top Tier Transitions <${fromEmail}>`,
            to: relevant.sentByEmail,
            subject: `${vendor.vendorName} wants ${item.itemName} — ${tenant?.city ?? ""}`,
            html: buildVendorClaimNotificationEmail({
              staffName: relevant.sentByName,
              vendorName: vendor.vendorName,
              city: tenant?.city ?? "",
              state: tenant?.state ?? "",
              claimedItems: [{ itemName: item.itemName, category: item.category, valueMid: item.valueMid }],
              catalogUrl: `${appUrl}/catalog?tenantId=${item.tenantId}`,
            }),
          });
        }
      }
    } catch (e) {
      console.error("Claim notification failed (non-fatal):", e);
    }
  }

  return NextResponse.json({ success: true, claimed: decision === "Approved" });
}
