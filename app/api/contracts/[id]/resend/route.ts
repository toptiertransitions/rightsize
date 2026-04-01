export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Resend } from "resend";
import {
  getContractById,
  updateContract,
  getContractsForTenant,
  getSystemRole,
  getTenantById,
} from "@/lib/airtable";
import { buildContractSentEmail } from "@/lib/email";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const recipientEmailArg: string | undefined =
    typeof body.recipientEmail === "string" ? body.recipientEmail.trim() || undefined : undefined;

  const contract = await getContractById(id);
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  const toEmail = recipientEmailArg ?? contract.recipientEmail;
  if (!toEmail) return NextResponse.json({ error: "No recipient email provided" }, { status: 400 });

  const tenant = await getTenantById(contract.tenantId).catch(() => null);
  if (!tenant) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Rotate the sign token so the previous email link is dead
  const newSignToken = crypto.randomUUID();
  const sentAt = new Date().toISOString();

  // Mark any other "Sent" contracts for this tenant as Superseded
  try {
    const allContracts = await getContractsForTenant(contract.tenantId);
    const toSupersede = allContracts.filter((c) => c.id !== id && c.status === "Sent");
    await Promise.all(
      toSupersede.map((c) => updateContract(c.id, { status: "Superseded" }).catch(() => null))
    );
  } catch { /* non-fatal */ }

  // Update this contract with the new token + send metadata
  const updated = await updateContract(id, {
    signToken: newSignToken,
    sentAt,
    sentByClerkId: userId,
    recipientEmail: toEmail,
    status: "Sent",
  });

  // Send the email with the new signing URL
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
    const signingUrl = `${appUrl}/sign/${newSignToken}`;
    const lineItems = (contract.lineItems ?? []).map((li) => ({
      serviceName: li.serviceName,
      hours: li.hours,
    }));

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "hello@rightsize.app";

    await resend.emails.send({
      from: `Top Tier Transitions <${fromEmail}>`,
      to: toEmail,
      subject: `Updated service agreement for ${tenant.name} — please review`,
      html: buildContractSentEmail({
        clientName: toEmail,
        projectName: tenant.name,
        signingUrl,
        totalCost: contract.totalCost,
        lineItems,
      }),
    });
  } catch (e) {
    console.error("Failed to send resend email:", e);
    // Non-fatal — token has already been rotated
  }

  return NextResponse.json({ contract: updated });
}
