export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { getSystemRole, getItemById, updateItem, getVendorOutreach, getLocalVendorById, getTenantById } from "@/lib/airtable";
import { buildVendorClaimNotificationEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { tenantId, itemAirtableIds, vendorAirtableId }: {
    tenantId: string;
    itemAirtableIds: string[];
    vendorAirtableId: string;
  } = body;

  const vendor = await getLocalVendorById(vendorAirtableId).catch(() => null);
  const tenant = await getTenantById(tenantId).catch(() => null);

  await Promise.all(
    itemAirtableIds.map(id =>
      updateItem(id, {
        claimedByVendorId: vendorAirtableId,
        vendorOutreachStatus: "Claimed",
        vendorDecision: "Approved",
        vendorRespondedAt: new Date().toISOString(),
      }).catch(() => null)
    )
  );

  // Look up the outreach record to find who sent it, and send them a confirmation
  try {
    const outreachRecords = await getVendorOutreach(tenantId);
    const relevant = outreachRecords.find(r => r.vendorAirtableId === vendorAirtableId);
    if (relevant?.sentByEmail) {
      const itemRecords = await Promise.all(itemAirtableIds.map(id => getItemById(id).catch(() => null)));
      const validItems = itemRecords.filter((i): i is NonNullable<typeof i> => i !== null);
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromEmail = process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com";
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
      const catalogUrl = `${appUrl}/catalog?tenantId=${tenantId}`;

      await resend.emails.send({
        from: `Top Tier Transitions <${fromEmail}>`,
        to: relevant.sentByEmail,
        subject: `Items marked as claimed — ${vendor?.vendorName ?? "Vendor"}`,
        html: buildVendorClaimNotificationEmail({
          staffName: relevant.sentByName,
          vendorName: vendor?.vendorName ?? "the vendor",
          city: tenant?.city ?? "",
          state: tenant?.state ?? "",
          claimedItems: validItems.map(i => ({ itemName: i.itemName, category: i.category, valueMid: i.valueMid })),
          catalogUrl,
        }),
      });
    }
  } catch (e) {
    console.error("Claim notification email failed (non-fatal):", e);
  }

  return NextResponse.json({ success: true });
}
