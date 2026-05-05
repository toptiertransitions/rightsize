import { NextRequest, NextResponse } from "next/server";
import { getInvoiceById, updateInvoice } from "@/lib/airtable";

// Public route — no auth required. Clients access this from the pay link in their email.
// Card/ACH data is forwarded directly to FluidPay and never stored.

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
    // Card
    cardNumber?: string;
    expirationDate?: string;
    cvc?: string;
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

  // Build FluidPay request body
  const billingAddress = {
    first_name: firstName,
    last_name: lastName,
    email,
    ...(body.phone ? { phone: body.phone.replace(/\D/g, "") } : {}),
  };

  const description = `Top Tier Transitions - Invoice ${invoice.invoiceNumber}`;

  // Idempotency key — prevents double charges on network retries
  const idempotencyKey = crypto.randomUUID();

  let paymentMethodBody: Record<string, unknown>;
  if (paymentMethod === "credit_card") {
    if (!body.cardNumber || !body.expirationDate || !body.cvc) {
      return NextResponse.json({ error: "Missing card details" }, { status: 400 });
    }
    paymentMethodBody = {
      card: {
        entry_type: "keyed",
        number: body.cardNumber.replace(/\s/g, ""),
        expiration_date: body.expirationDate, // MM/YY
        cvc: body.cvc,
      },
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
    idempotency_key: idempotencyKey,
    idempotency_time: 300,
  };

  // FluidPay can take up to 3 minutes — set a matching abort timeout
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

  // Parse response per FluidPay spec
  const txnData = fpData.data as Record<string, unknown> | undefined;
  const response = txnData?.response as string | undefined;
  const responseCode = txnData?.response_code as number | undefined;
  const approved = response === "approved" && responseCode === 100;

  if (!approved) {
    // 200-299: declined by bank; 300-399: gateway/processor error
    let msg = "Payment was declined. Please check your details or try a different payment method.";
    if (responseCode && responseCode >= 300) {
      msg = "A gateway error occurred. Please try again or contact your coordinator.";
    }
    const gatewayMsg = (txnData?.response_body as Record<string, unknown>)?.response_text as string;
    if (gatewayMsg) msg = gatewayMsg;
    console.error("[pay] FluidPay declined:", { responseCode, response, fpData });
    return NextResponse.json({ error: msg }, { status: 402 });
  }

  // Store transaction details
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
    // Payment succeeded — log the failure but don't error the client
    console.error("[pay] Airtable update failed after successful payment — txnId:", txnId, err);
  }

  return NextResponse.json({ ok: true, transactionId: txnId });
}
