export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getUserRoleForTenant,
  getInvoiceById,
  getTenantById,
  getInvoiceSettings,
} from "@/lib/airtable";
import { renderInvoicePDF } from "@/lib/invoice-pdf";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const invoice = await getInvoiceById(id).catch(() => null);
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  // Auth: sysRole or tenant member
  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole) {
    const tenantRole = await getUserRoleForTenant(userId, invoice.tenantId).catch(() => null);
    if (!tenantRole) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [tenant, settings] = await Promise.all([
    getTenantById(invoice.tenantId).catch(() => null),
    getInvoiceSettings().catch(() => null),
  ]);

  const defaultSettings = {
    id: undefined,
    companyName: "Top Tier Transitions",
    companyAddress: "",
    companyPhone: "",
    companyEmail: "",
    paymentLinkUrl: "",
    invoiceFooter: "",
    logoUrl: "",
    logoPublicId: "",
    updatedAt: "",
  };

  const pdfBuffer = await renderInvoicePDF({
    invoice,
    tenantName: tenant?.name || "Client",
    settings: settings ?? defaultSettings,
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`,
    },
  });
}
