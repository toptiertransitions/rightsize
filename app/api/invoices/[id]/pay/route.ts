import { NextRequest, NextResponse } from "next/server";
import { getInvoiceById, updateInvoice } from "@/lib/airtable";

// Public route — no auth required. Clients access this from the pay link in their email.
// Card data is tokenized client-side by FluidPay; only the token reaches this server.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: {
    paymentMethod: "credit_card" | "ach";
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    // Card — token from FluidPay tokenizer (never raw card data)
    token?: string;
    zipCode?: string;
    // ACH
    routingNumber?: string;
    accountNumber?: string;
    accountType?: "checking" | "savings";
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { paymentMethod, firstName, lastName, email } = body;
  if (!paymentMethod || !firstName || !lastName || !email) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const invoice = await getInvoiceById(id).catch(() => null);
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (invoice.status === "Paid") return NextResponse.json({ error: "This invoice has already been paid." }, { status: 400 });

  const fluidpayUrl = process.env.FLUIDPAY_URL || "https://sandbox.fluidpay.com";
  const fluidpayApiKey = process.env.FLUIDPAY_API_KEY;
  if (!fluidpayApiKey) {
    console.error("[pay] FLUIDPAY_API_KEY not configured");
    return NextResponse.json({ error: "Payment processor is not configured. Please contact your coordinator." }, { status: 503 });
  }

  const balance = invoice.amount - (invoice.paidAmount ?? 0);
  if (balance <= 0) return NextResponse.json({ error: "This invoice has already been paid." }, { status: 400 });

  const amountCents = Math.round(balance * 100);

  const billingAddress = {
    first_name: firstName,
    last_name: lastName,
    email,
    ...(body.phone ? { phone: body.phone.replace(/\D/g, "") } : {}),
    ...(body.zipCode ? { postal_code: body.zipCode, country: "US" } : {}),
  };

  const description = `Top Tier Transitions - Invoice ${invoice.invoiceNumber}`;

  let paymentMethodBody: Record<string, unknown>;
  if (paymentMethod === "credit_card") {
    if (!body.token) {
      return NextResponse.json({ error: "Missing payment token" }, { status: 400 });
    }
    paymentMethodBody = {
      token: body.token,
    };
  } else {
    if (!body.routingNumber || !body.accountNumber || !body.accountType) {
      return NextResponse.json({ error: "Missing ACH details" }, { status: 400 });
    }
    paymentMethodBody = {
      ach: {
        routing_number: body.routingNumber,
        account_number: body.accountNumber,
        sec_code: "web",
        account_type: body.accountType,
      },
    };
  }

  const fpRequestBody = {
    type: "sale",
    amount: amountCents,
    currency: "USD",
    payment_method: paymentMethodBody,
    billing_address: billingAddress,
    description,
    email_receipt: true,
    email_address: email,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);

  let fpData: Record<string, unknown>;
  try {
    const fpRes = await fetch(`${fluidpayUrl}/api/transaction`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": fluidpayApiKey,
      },
      body: JSON.stringify(fpRequestBody),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    fpData = await fpRes.json().catch(() => ({}));
  } catch (err) {
    clearTimeout(timeout);
    if ((err as Error)?.name === "AbortError") {
      return NextResponse.json({ error: "The payment request timed out. Please try again." }, { status: 504 });
    }
    console.error("[pay] FluidPay request failed:", err);
    return NextResponse.json({ error: "Could not reach the payment processor. Please try again." }, { status: 502 });
  }

  const topLevelStatus = fpData.status as string | undefined;
  const topLevelMsg = fpData.msg as string | undefined;
  const txnData = fpData.data as Record<string, unknown> | undefined;
  const response = txnData?.response as string | undefined;
  const responseCode = txnData?.response_code as number | undefined;
  const approved = response === "approved" && responseCode === 100;

  if (!approved) {
    console.error("[pay] FluidPay declined — full response:", JSON.stringify(fpData));

    if (topLevelStatus === "error" || topLevelStatus === "failed" || !txnData) {
      return NextResponse.json({ error: topLevelMsg || "Payment processor error. Please contact your coordinator." }, { status: 402 });
    }

    const cardBody = (txnData?.response_body as Record<string, unknown>)?.card as Record<string, unknown> | undefined;
    const achBody = (txnData?.response_body as Record<string, unknown>)?.ach as Record<string, unknown> | undefined;
    const responseText = (cardBody?.response_text || achBody?.response_text) as string | undefined;
    const msg = responseText || (responseCode && responseCode >= 300
      ? "A gateway error occurred. Please try again or contact your coordinator."
      : "Payment was declined. Please check your details or try a different payment method.");
    return NextResponse.json({ error: msg }, { status: 402 });
  }

  const txnId = txnData?.id as string | undefined;
  const maskedCard = ((txnData?.response_body as Record<string, unknown>)?.card as Record<string, unknown>)?.masked_card as string | undefined;
  const authCode = ((txnData?.response_body as Record<string, unknown>)?.card as Record<string, unknown>)?.auth_code as string | undefined;

  const noteLines = [
    invoice.notes,
    [
      `FluidPay (${paymentMethod === "credit_card" ? "card" : "ACH"}): ${txnId ?? ""}`,
      maskedCard ? `card: ${maskedCard}` : "",
      authCode ? `auth: ${authCode}` : "",
    ].filter(Boolean).join(" | "),
  ].filter(Boolean).join(" | ");

  try {
    await updateInvoice(id, {
      status: "Paid",
      paidAmount: invoice.amount,
      paidAt: new Date().toISOString().slice(0, 10),
      notes: noteLines.trim(),
    });
  } catch (err) {
    console.error("[pay] Airtable update failed after successful payment — txnId:", txnId, err);
  }

  return NextResponse.json({ ok: true, transactionId: txnId });
}
