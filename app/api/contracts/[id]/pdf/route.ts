export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getContractById,
  getTenantById,
  getSystemRole,
  getUserRoleForTenant,
  getInvoiceSettings,
} from "@/lib/airtable";
import { renderContractPDF } from "@/lib/contract-pdf";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;

  const contract = await getContractById(id).catch(() => null);
  if (!contract) return new NextResponse("Not found", { status: 404 });

  const [sysRole, tenantRole] = await Promise.all([
    getSystemRole(userId).catch(() => null),
    getUserRoleForTenant(userId, contract.tenantId).catch(() => null),
  ]);

  const isManagerOrAdmin = sysRole === "TTTAdmin" || sysRole === "TTTManager";
  const isTenantMember = tenantRole != null;

  if (!isManagerOrAdmin && !isTenantMember) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const [tenant, invoiceSettings] = await Promise.all([
    getTenantById(contract.tenantId).catch(() => null),
    getInvoiceSettings().catch(() => null),
  ]);

  const pdfBuffer = await renderContractPDF({
    contract,
    tenantName: tenant?.name ?? "Client",
    settings: invoiceSettings,
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="agreement-${id.slice(0, 8)}.pdf"`,
    },
  });
}
