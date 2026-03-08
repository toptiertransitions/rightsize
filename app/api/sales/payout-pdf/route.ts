export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { createProjectFile } from "@/lib/airtable";
import { uploadFile } from "@/lib/cloudinary";
import { renderPayoutPDF } from "@/lib/payout-pdf";
import { buildPayoutEmail } from "@/lib/email";
import { Resend } from "resend";
import type { PayoutLineItem } from "@/lib/payout-pdf";

const resend = new Resend(process.env.RESEND_API_KEY);

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
    clientName,
    clientAddress,
    clientEmail,
    companyName = "Top Tier Transitions",
    companyAddress,
    companyPhone,
    companyEmail,
    items,
    sendEmail,
    recipientEmail,
    ccEmail,
  }: {
    tenantId: string;
    clientName: string;
    clientAddress?: string;
    clientEmail?: string;
    companyName?: string;
    companyAddress?: string;
    companyPhone?: string;
    companyEmail?: string;
    items: PayoutLineItem[];
    sendEmail: boolean;
    recipientEmail?: string;
    ccEmail?: string;
  } = body;

  if (!tenantId || !clientName || !items?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const date = new Date().toISOString().slice(0, 10);
  const total = items.reduce((s: number, i: PayoutLineItem) => s + i.clientPayout, 0);

  // Generate PDF
  const pdfBuffer = await renderPayoutPDF({
    clientName,
    clientAddress,
    clientEmail,
    companyName,
    companyAddress,
    companyPhone,
    companyEmail,
    date,
    items,
  });

  // Upload to Cloudinary
  const uploaded = await uploadFile(pdfBuffer as Buffer, {
    folder: `rightsize/${tenantId}/payment-proofs`,
    tenantId,
    mimeType: "application/pdf",
  });

  const fileName = `Payout-${clientName.replace(/\s+/g, "-")}-${date}.pdf`;

  // Save as ProjectFile with tag "Payment Proof"
  const file = await createProjectFile({
    tenantId,
    fileName,
    fileTag: "Payment Proof",
    cloudinaryUrl: uploaded.secureUrl,
    cloudinaryPublicId: uploaded.publicId,
    resourceType: uploaded.resourceType,
  });

  // Optionally send email
  if (sendEmail && recipientEmail) {
    try {
      const html = buildPayoutEmail({
        clientName,
        total,
        itemCount: items.length,
        date: new Date(date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        companyName,
      });

      const emailOpts: Parameters<typeof resend.emails.send>[0] = {
        from: "hello@toptiertransitions.com",
        to: recipientEmail,
        subject: `Your Payout Statement — ${new Date(date).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
        html,
        attachments: [
          {
            filename: fileName,
            content: (pdfBuffer as Buffer).toString("base64"),
          },
        ],
      };
      if (ccEmail) emailOpts.cc = ccEmail;
      await resend.emails.send(emailOpts);
    } catch (e) {
      console.error("[payout-pdf] email send failed:", e);
      // Don't fail the request — file was saved successfully
    }
  }

  return NextResponse.json({ file });
}
