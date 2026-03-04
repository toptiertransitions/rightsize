import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getContractByToken, updateContract, getTenantById } from "@/lib/airtable";
import { buildContractSignedEmail } from "@/lib/email";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  const { token, signatureData, method, signerName } = await req.json();

  if (!token || !signerName?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const contract = await getContractByToken(token);
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  if (contract.status === "Signed") return NextResponse.json({ error: "Already signed" }, { status: 409 });

  const signedAt = new Date().toISOString();
  await updateContract(contract.id, {
    status: "Signed",
    signatureData: signatureData ?? "",
    signatureMethod: method === "type" ? "type" : "draw",
    signedAt,
    signedByName: signerName.trim(),
  });

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
