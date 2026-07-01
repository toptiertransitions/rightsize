import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getInvoiceById, updateInvoice, getInvoiceSettings, getTenantById } from "@/lib/airtable";
import { buildPaymentReceiptEmail } from "@/lib/email";

// Public route — no auth required. Clients access this from the pay link in their email.
// Card data is tokenized client-side by FluidPay; only the token reaches this server.

export const maxDuration = 60;

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

  const fluidpayUrl = (process.env.FLUIDPAY_URL || "https://app.fluidpay.com").trim();
  const fluidpayApiKey = process.env.FLUIDPAY_API_KEY;
  if (!fluidpayApiKey) {
    console.error("[pay] FLUIDPAY_API_KEY not configured");
    return NextResponse.json({ error: "Payment processor is not configured. Please contact your coordinator." }, { status: 503 });
  }

  const balance = invoice.amount - (invoice.paidAmount ?? 0);
  if (balance <= 0) return NextResponse.json({ error: "This invoice has already been paid." }, { status: 400 });

  // Credit card carries a 3.99% processing surcharge; ACH/check do not
  const surchargeRate = paymentMethod === "credit_card" ? 0.0399 : 0;
  const chargeAmount = balance * (1 + surchargeRate);
  const amountCents = Math.round(chargeAmount * 100);

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
        sec_code: "WEB",
        account_type: body.accountType,
        name_on_account: `${firstName} ${lastName}`,
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
    email_receipt: false,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  console.log("[pay] sending to FluidPay:", fluidpayUrl, "method:", body.paymentMethod, "cents:", amountCents);

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
    console.log("[pay] FluidPay HTTP status:", fpRes.status, "body:", JSON.stringify(fpData));
  } catch (err) {
    clearTimeout(timeout);
    if ((err as Error)?.name === "AbortError") {
      console.error("[pay] FluidPay request timed out after 60s");
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

    // Top-level API error (validation failure, bad key, etc.)
    if (topLevelStatus === "error" || topLevelStatus === "failed" || !txnData) {
      // FluidPay sometimes puts errors in an `errors` array instead of `msg`
      const errorsArray = Array.isArray(fpData.errors) ? (fpData.errors as string[]).join("; ") : undefined;
      const errMsg = topLevelMsg || errorsArray || "Payment processor error. Please contact your coordinator.";
      return NextResponse.json({ error: errMsg }, { status: 402 });
    }

    const responseBody = txnData.response_body as Record<string, unknown> | undefined;
    const cardBody = responseBody?.card as Record<string, unknown> | undefined;
    const achBody = responseBody?.ach as Record<string, unknown> | undefined;
    const responseText = (cardBody?.response_text || achBody?.response_text || responseBody?.response_text) as string | undefined;
    const msg = responseText || (responseCode && responseCode >= 300
      ? "A gateway error occurred. Please try again or contact your coordinator."
      : "Payment was declined. Please check your details or try a different payment method.");
    return NextResponse.json({ error: msg }, { status: 402 });
  }

  const txnId = txnData?.id as string | undefined;
  const maskedCard = ((txnData?.response_body as Record<string, unknown>)?.card as Record<string, unknown>)?.masked_card as string | undefined;
  const authCode = ((txnData?.response_body as Record<string, unknown>)?.card as Record<string, unknown>)?.auth_code as string | undefined;

  const surchargeNote = surchargeRate > 0
    ? ` | surcharge: $${((chargeAmount - balance)).toFixed(2)} (3.99%)`
    : "";
  const noteLines = [
    invoice.notes,
    [
      `FluidPay (${paymentMethod === "credit_card" ? "card" : "ACH"}): ${txnId ?? ""}`,
      maskedCard ? `card: ${maskedCard}` : "",
      authCode ? `auth: ${authCode}` : "",
    ].filter(Boolean).join(" | ") + surchargeNote,
  ].filter(Boolean).join(" | ");

  try {
    const paidAtEastern = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD in ET
    await updateInvoice(id, {
      status: "Paid",
      paidAmount: invoice.amount,
      paidAt: paidAtEastern,
      notes: noteLines.trim(),
    });
  } catch (err) {
    console.error("[pay] Airtable update failed after successful payment — txnId:", txnId, err);
  }

  // Send branded receipt email via Resend
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const [settings, tenant] = await Promise.all([
        getInvoiceSettings().catch(() => null),
        getTenantById(invoice.tenantId).catch(() => null),
      ]);
      const companyName = settings?.companyName || "Top Tier Transitions";
      const paidAtFormatted = new Date().toLocaleString("en-US", {
        timeZone: "America/New_York",
        month: "long", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", timeZoneName: "short",
      });
      const html = buildPaymentReceiptEmail({
        firstName,
        invoiceNumber: invoice.invoiceNumber,
        projectName: tenant?.name,
        serviceName: invoice.serviceName,
        amountPaid: chargeAmount,
        paymentMethod,
        maskedCard,
        transactionId: txnId,
        paidAt: paidAtFormatted,
        companyName,
        companyEmail: settings?.companyEmail,
        companyPhone: settings?.companyPhone,
        logoUrl: settings?.logoUrl,
        lineItems: invoice.lineItems,
      });
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: `${companyName} <billing@toptiertransitions.com>`,
        to: email,
        bcc: "billing@toptiertransitions.com",
        subject: `Payment Confirmation — Invoice ${invoice.invoiceNumber}`,
        html,
      });
    }
  } catch (err) {
    console.error("[pay] receipt email failed:", err);
  }

  return NextResponse.json({ ok: true, transactionId: txnId });
}
