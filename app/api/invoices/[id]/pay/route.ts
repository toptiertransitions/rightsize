import { NextRequest, NextResponse } from "next/server";
import { getInvoiceById, updateInvoice } from "@/lib/airtable";

// Public route — no auth required; clients access this from the pay page link in their email.
// Security is provided by FluidPay: tokens are single-use and expire in 2 minutes.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: { token?: string; paymentMethod?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { token, paymentMethod } = body;
  if (!token) {
    return NextResponse.json({ error: "Missing payment token" }, { status: 400 });
  }

  const invoice = await getInvoiceById(id).catch(() => null);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  if (invoice.status === "Paid") {
    return NextResponse.json({ error: "This invoice has already been paid." }, { status: 400 });
  }

  const fluidpayUrl = process.env.FLUIDPAY_URL || "https://sandbox.fluidpay.com";
  const fluidpayApiKey = process.env.FLUIDPAY_API_KEY;
  if (!fluidpayApiKey) {
    console.error("[pay] FLUIDPAY_API_KEY not configured");
    return NextResponse.json({ error: "Payment processor is not configured. Please contact your coordinator." }, { status: 503 });
  }

  // Remaining balance (handles partially-paid invoices)
  const balance = invoice.amount - (invoice.paidAmount ?? 0);
  if (balance <= 0) {
    return NextResponse.json({ error: "This invoice has already been paid." }, { status: 400 });
  }

  // FluidPay expects amount in cents as an integer
  const amountCents = Math.round(balance * 100);

  let fpData: Record<string, unknown>;
  try {
    const fpRes = await fetch(`${fluidpayUrl}/api/transaction`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": fluidpayApiKey,
      },
      body: JSON.stringify({
        type: "sale",
        amount: amountCents,
        currency: "usd",
        payment_method: {
          token: { id: token },
        },
      }),
    });

    fpData = await fpRes.json().catch(() => ({}));

    const approved =
      fpRes.ok &&
      (fpData.status === "success" ||
        (fpData.data as Record<string, unknown>)?.status === "pending_settlement" ||
        (fpData.data as Record<string, unknown>)?.status === "approved");

    if (!approved) {
      const msg =
        (fpData.msg as string) ||
        (fpData.message as string) ||
        ((fpData.data as Record<string, unknown>)?.status_message as string) ||
        "Payment was declined. Please check your details and try again.";
      console.error("[pay] FluidPay declined:", fpData);
      return NextResponse.json({ error: msg }, { status: 402 });
    }
  } catch (err) {
    console.error("[pay] FluidPay request failed:", err);
    return NextResponse.json({ error: "Could not reach payment processor. Please try again." }, { status: 502 });
  }

  // Mark invoice as paid in Airtable
  const txnId =
    ((fpData.data as Record<string, unknown>)?.id as string) ||
    (fpData.id as string) ||
    "";
  const noteLines = [
    invoice.notes,
    `FluidPay (${paymentMethod ?? "card"}): ${txnId}`.trim(),
  ].filter(Boolean).join(" | ");

  try {
    await updateInvoice(id, {
      status: "Paid",
      paidAmount: invoice.amount,
      paidAt: new Date().toISOString().slice(0, 10),
      notes: noteLines,
    });
  } catch (err) {
    // Payment succeeded but Airtable update failed — log it, don't fail the client
    console.error("[pay] Airtable update failed after successful payment:", err, "txnId:", txnId);
  }

  return NextResponse.json({ ok: true });
}
