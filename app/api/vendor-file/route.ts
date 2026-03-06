export const runtime = "nodejs"; // @react-pdf/renderer requires Node.js

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Resend } from "resend";
import {
  getItemById,
  getLocalVendorById,
  getUserRoleForTenant,
  getSystemRole,
  updateItem,
  getInvoiceSettings,
} from "@/lib/airtable";
import { renderVendorFilePDF } from "@/lib/vendor-pdf";
import { buildVendorFileEmail } from "@/lib/email";

const resend = new Resend(process.env.RESEND_API_KEY);

const EDIT_ROLES = ["Owner", "Collaborator", "TTTStaff", "TTTAdmin", "TTTManager"];

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { itemIds, vendorId, ccEmail, tenantId } = body as {
    itemIds: string[];
    vendorId: string;
    ccEmail?: string;
    tenantId?: string;
  };

  if (!itemIds?.length || !vendorId) {
    return NextResponse.json({ error: "Missing itemIds or vendorId" }, { status: 400 });
  }

  // Auth: need edit role on the tenant (or system role)
  const sysRole = await getSystemRole(userId).catch(() => null);
  if (tenantId) {
    const role = await getUserRoleForTenant(userId, tenantId).catch(() => null);
    const resolved = role ?? sysRole;
    if (!resolved || !EDIT_ROLES.includes(resolved)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (!sysRole || !EDIT_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch items + vendor + settings in parallel
  const [vendor, settings, ...itemResults] = await Promise.all([
    getLocalVendorById(vendorId),
    getInvoiceSettings().catch(() => null),
    ...itemIds.map((id) => getItemById(id).catch(() => null)),
  ]);

  if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  if (!vendor.email) return NextResponse.json({ error: "Vendor has no email address" }, { status: 400 });

  const items = itemResults.filter(Boolean) as Awaited<ReturnType<typeof getItemById>>[];
  if (items.length === 0) return NextResponse.json({ error: "No valid items found" }, { status: 400 });

  const validItems = items.filter((i) => i !== null);

  // Generate PDF
  const preparedDate = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderVendorFilePDF({
      items: validItems,
      vendor,
      settings,
      preparedDate,
    });
  } catch (e) {
    console.error("PDF generation failed:", e);
    return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
  }

  // Assign vendor to all items + set decision to Pending
  await Promise.all(
    validItems.map((item) =>
      updateItem(item.id, {
        assignedVendorId: vendorId,
        vendorDecision: "Pending",
      }).catch((e) => console.error(`Failed to update item ${item.id}:`, e))
    )
  );

  // Build portal URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
  const portalUrl = `${appUrl}/vendor`;

  // Send email
  const companyName = settings?.companyName || "Top Tier Transitions";
  try {
    await resend.emails.send({
      from: `${companyName} <noreply@toptiertransitions.com>`,
      to: vendor.email,
      cc: ccEmail ? [ccEmail] : [],
      subject: `${validItems.length} item${validItems.length !== 1 ? "s" : ""} ready for your review — ${companyName}`,
      html: buildVendorFileEmail({
        vendorName: vendor.vendorName,
        itemCount: validItems.length,
        portalUrl,
        companyName,
        items: validItems.map((i) => ({
          itemName: i.itemName,
          valueMid: i.valueMid,
          category: i.category,
        })),
      }),
      attachments: [
        {
          filename: `vendor-items-${new Date().toISOString().slice(0, 10)}.pdf`,
          content: pdfBuffer,
        },
      ],
    });
  } catch (e) {
    console.error("Email send failed:", e);
    return NextResponse.json({ error: "Email delivery failed" }, { status: 500 });
  }

  // Return updated items so the UI can refresh
  const updatedItems = await Promise.all(
    validItems.map((item) => getItemById(item.id).catch(() => item))
  );

  return NextResponse.json({ ok: true, items: updatedItems.filter(Boolean) });
}
