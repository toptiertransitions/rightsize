import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getUserRoleForTenant,
  getInvoicesForTenant,
  getAllInvoiceCount,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  getAllServices,
  getInvoiceSettings,
} from "@/lib/airtable";
import { createQBOInvoice } from "@/lib/qbo";
import { buildInvoiceEmail } from "@/lib/email";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  const tenantRole = sysRole ? null : await getUserRoleForTenant(userId, tenantId).catch(() => null);
  const role = sysRole || tenantRole;
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const invoices = await getInvoicesForTenant(tenantId);
  return NextResponse.json({ invoices });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !["TTTManager", "TTTAdmin"].includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    tenantId,
    type,
    serviceId,
    serviceName,
    depositType,
    depositPercent,
    amount,
    contractId,
    lineItems,
    pushToQBO,
    sendEmail,
    sentToEmail,
    ccEmail,
    tenantName,
    customerName,
  } = body;

  if (!tenantId || !type || !amount) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Generate invoice number
  const count = await getAllInvoiceCount().catch(() => 0);
  const invoiceNumber = `INV-${String(count + 1).padStart(4, "0")}`;

  let qboInvoiceId: string | undefined;
  let qboDocNumber: string | undefined;

  // Push to QBO if requested
  if (pushToQBO) {
    try {
      const services = await getAllServices().catch(() => []);
      const serviceMap = new Map(services.map((s) => [s.id, s]));

      let qboLineItems: Array<{ serviceName: string; hours: number; rate: number; qboItemId?: string }>;

      if (type === "Deposit") {
        // Deposit: single line item with qty=1, rate=amount
        const svc = serviceMap.get(serviceId);
        qboLineItems = [{
          serviceName: serviceName || "Deposit",
          hours: 1,
          rate: amount,
          qboItemId: svc?.qboItemId,
        }];
      } else {
        // Full: use lineItems array
        qboLineItems = (lineItems || []).map((item: { serviceId: string; serviceName: string; hours: number; rate: number }) => ({
          serviceName: item.serviceName,
          hours: item.hours,
          rate: item.rate,
          qboItemId: serviceMap.get(item.serviceId)?.qboItemId,
        }));
      }

      const qboResult = await createQBOInvoice({
        customerName: customerName || tenantName || "Client",
        lineItems: qboLineItems,
        memo: `Invoice ${invoiceNumber}`,
      });
      qboInvoiceId = qboResult.id;
      qboDocNumber = qboResult.docNumber;
    } catch (e) {
      console.error("QBO invoice creation failed:", e);
    }
  }

  // Create invoice first so we have the ID for the payment URL
  let invoice = await createInvoice({
    tenantId,
    type,
    invoiceNumber,
    serviceId: serviceId || "",
    serviceName: serviceName || "",
    depositType,
    depositPercent,
    amount,
    contractId,
    lineItems,
    qboInvoiceId,
    qboDocNumber,
    sentToEmail,
    ccEmail,
    emailSent: false,
    createdByClerkId: userId,
  });

  // Send email with a link back to the platform payment page
  if (sendEmail && sentToEmail) {
    try {
      const settings = await getInvoiceSettings().catch(() => null);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
      const payUrl = `${appUrl}/pay/${invoice.id}`;
      const html = buildInvoiceEmail({
        invoiceNumber,
        tenantName: tenantName || "Client",
        type,
        amount,
        serviceName: serviceName || "Services",
        payUrl,
        companyName: settings?.companyName || "Top Tier Transitions",
        logoUrl: settings?.logoUrl,
      });
      const emailOpts: Parameters<typeof resend.emails.send>[0] = {
        from: process.env.RESEND_FROM_EMAIL || "invoices@yourdomain.com",
        to: sentToEmail,
        subject: `Invoice ${invoiceNumber} — ${type} Invoice`,
        html,
      };
      if (ccEmail) emailOpts.cc = ccEmail;
      await resend.emails.send(emailOpts);
      invoice = await updateInvoice(invoice.id, { emailSent: true });
    } catch (e) {
      console.error("Invoice email send failed:", e);
    }
  }

  return NextResponse.json({ invoice });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !["TTTManager", "TTTAdmin"].includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id, status, paidAmount, paidAt, notes } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const invoice = await updateInvoice(id, { status, paidAmount, paidAt, notes });
  return NextResponse.json({ invoice });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !["TTTManager", "TTTAdmin"].includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await deleteInvoice(id);
  return NextResponse.json({ ok: true });
}
