import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getContractByToken, updateContract, updateTenant, getTenantById, createInvoice, getAllInvoiceCount, getInvoiceSettings, getOpportunitiesForTenant, getOpportunitiesForContact, getClientContactByEmail, updateOpportunity } from "@/lib/airtable";
import { buildContractSignedEmail, buildInvoiceEmail } from "@/lib/email";
import { renderContractPDF } from "@/lib/contract-pdf";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  const { token, signatureData, method, signerName } = await req.json();

  if (!token || !signerName?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  let contract;
  try {
    contract = await getContractByToken(token);
  } catch (e) {
    console.error("getContractByToken error:", e);
    return NextResponse.json({ error: "Unable to load the contract. Please try again or contact support." }, { status: 500 });
  }
  if (!contract) return NextResponse.json({ error: "This signing link is invalid or has expired. Please contact Top Tier Transitions for a new link." }, { status: 404 });
  // A contract may have status "Signed" because TTT staff set it as the primary quote,
  // but the client hasn't actually signed yet (signedAt is empty in that case).
  if (contract.status === "Signed" && contract.signedAt) {
    return NextResponse.json({ error: "This agreement has already been signed. No further action is needed." }, { status: 409 });
  }

  const signedAt = new Date().toISOString();
  try {
    await updateContract(contract.id, {
      status: "Signed",
      signatureData: signatureData ?? "",
      signatureMethod: method === "type" ? "type" : "draw",
      signedAt,
      signedByName: signerName.trim(),
    });
  } catch (e) {
    console.error("updateContract (sign) error:", e);
    return NextResponse.json({ error: "Failed to save your signature. Please try again — your information was not lost." }, { status: 500 });
  }

  // Auto-create a 40% deposit invoice (only when autoSendDeposit is enabled)
  let createdInvoice: Awaited<ReturnType<typeof createInvoice>> | null = null;
  if (contract.autoSendDeposit) {
    try {
      const invoiceCount = await getAllInvoiceCount().catch(() => 0);
      const depositPct = 40;
      const depositAmount = Math.round(contract.totalCost * depositPct / 100 * 100) / 100;
      const invoiceNumber = `INV-${String(invoiceCount + 1).padStart(4, "0")}`;
      const primaryService = contract.lineItems?.[0];
      createdInvoice = await createInvoice({
        tenantId: contract.tenantId,
        type: "Deposit",
        invoiceNumber,
        serviceId: primaryService?.serviceId ?? "",
        serviceName: primaryService?.serviceName ?? "Services",
        depositType: "PercentOfEstimate",
        depositPercent: depositPct,
        amount: depositAmount,
        contractId: contract.id,
        lineItems: contract.lineItems,
        createdByClerkId: contract.sentByClerkId ?? "system",
      });
    } catch (e) {
      console.error("Failed to auto-create deposit invoice:", e);
    }
  }

  // If autoSendDeposit: email the deposit invoice to the signer with signed contract PDF attached
  if (contract.autoSendDeposit && createdInvoice && contract.recipientEmail) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromEmail = process.env.RESEND_FROM_EMAIL ?? "hello@rightsize.app";
      const tenant = await getTenantById(contract.tenantId).catch(() => null);
      const invoiceSettings = await getInvoiceSettings().catch(() => null);

      // Generate signed contract PDF for attachment
      const pdfBuffer = await renderContractPDF({
        contract: { ...contract, status: "Signed", signedAt, signedByName: signerName.trim() },
        tenantName: tenant?.name ?? "Client",
        settings: invoiceSettings,
      }).catch(() => null);

      const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
      const payUrl = `${appUrl}/pay/${createdInvoice.id}`;

      const html = buildInvoiceEmail({
        invoiceNumber: createdInvoice.invoiceNumber,
        tenantName: tenant?.name ?? "Client",
        type: "Deposit",
        amount: createdInvoice.amount,
        serviceName: createdInvoice.serviceName,
        payUrl,
        companyName: invoiceSettings?.companyName || "Top Tier Transitions",
        logoUrl: invoiceSettings?.logoUrl,
      });

      const emailPayload: Parameters<typeof resend.emails.send>[0] = {
        from: `Top Tier Transitions <${fromEmail}>`,
        to: contract.recipientEmail,
        subject: `${fmt(createdInvoice.amount)} Deposit Invoice — ${tenant?.name ?? "Your Project"}`,
        html,
      };

      if (pdfBuffer) {
        emailPayload.attachments = [{
          filename: `agreement-${contract.id.slice(0, 8)}.pdf`,
          content: Buffer.from(pdfBuffer).toString("base64"),
        }];
      }

      await resend.emails.send(emailPayload);
    } catch (e) {
      console.error("Failed to auto-send deposit invoice:", e);
    }
  }

  // Update tenant estimatedHours to the signed contract total hours
  try {
    const totalContractHours = contract.rightsizingHours + contract.packingHours + contract.unpackingHours;
    await updateTenant(contract.tenantId, { estimatedHours: totalContractHours });
  } catch (e) {
    console.error("Failed to update tenant estimatedHours on sign:", e);
  }

  // Auto-advance opportunity to Won and set estimatedValue to the signed contract amount.
  // Two lookup paths:
  //   1. Primary: find opportunities by TenantId (set on opportunity when created)
  //   2. Fallback: if none found, look up the ClientContact by the contract's recipient
  //      email and find their opportunities (handles cases where TenantId wasn't populated)
  // Stage filter: any active stage (Lead / Qualifying / Proposing) → not just Proposing,
  //   since the opportunity may not have been manually advanced before signing.
  try {
    let opps = await getOpportunitiesForTenant(contract.tenantId).catch(() => []);

    if (opps.length === 0 && contract.recipientEmail) {
      const contact = await getClientContactByEmail(contract.recipientEmail).catch(() => null);
      if (contact) {
        opps = await getOpportunitiesForContact(contact.id).catch(() => []);
      }
    }

    const toUpdate = opps.filter((o) => !["Won", "Lost"].includes(o.stage));
    await Promise.all(
      toUpdate.map((o) =>
        updateOpportunity(o.id, {
          stage: "Won",
          wonAt: new Date().toISOString(),
          estimatedValue: contract.totalCost,
        }).catch(() => null)
      )
    );
  } catch { /* non-fatal */ }

  // Notify manager
  if (contract.sentByClerkId) {
    try {
      const clerk = await clerkClient();
      const managerUser = await clerk.users.getUser(contract.sentByClerkId).catch(() => null);
      const managerEmail = managerUser?.emailAddresses?.[0]?.emailAddress;
      const managerName =
        [managerUser?.firstName, managerUser?.lastName].filter(Boolean).join(" ") || undefined;

      if (managerEmail) {
        // Look up tenant for project name
        const tenant = await getTenantById(contract.tenantId).catch(() => null);

        const resend = new Resend(process.env.RESEND_API_KEY);
        const fromEmail = process.env.RESEND_FROM_EMAIL ?? "hello@rightsize.app";
        await resend.emails.send({
          from: `Top Tier Transitions <${fromEmail}>`,
          to: managerEmail,
          subject: `${signerName.trim()} signed the agreement for ${tenant?.name ?? "a project"}`,
          html: buildContractSignedEmail({
            managerName,
            clientName: signerName.trim(),
            projectName: tenant?.name ?? "the project",
            signedAt,
            totalCost: contract.totalCost,
          }),
        });
      }
    } catch (e) {
      console.error("Failed to send signed notification:", e);
    }
  }

  return NextResponse.json({ success: true });
}
