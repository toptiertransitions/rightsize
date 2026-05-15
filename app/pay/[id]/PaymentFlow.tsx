"use client";

import { useState, useEffect, useRef } from "react";

type PayMethod = "credit_card" | "ach" | "check";
type Step = "select" | "check_confirm" | "card_form" | "ach_form" | "processing" | "success";

interface Props {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  companyName: string;
  prefillEmail?: string;
  fluidpayPublicKey?: string;
  fluidpayBaseUrl?: string;
}

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Field({
  label, value, onChange, type = "text", placeholder, maxLength, inputMode,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; maxLength?: number;
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete="off"
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2E6B4F] focus:border-transparent"
      />
    </div>
  );
}

// Wrapper that looks like our Field but contains a FluidPay iframe
function IframeField({ label, id }: { label: string; id: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <div
        id={id}
        className="w-full border border-gray-300 rounded-lg px-3 text-sm"
        style={{ minHeight: "42px", display: "flex", alignItems: "center" }}
      />
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mb-5 transition-colors">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      Back
    </button>
  );
}

export function PaymentFlow({
  invoiceId, invoiceNumber, amount, companyName, prefillEmail = "",
  fluidpayPublicKey = "", fluidpayBaseUrl = "https://sandbox.fluidpay.com",
}: Props) {
  const [step, setStep] = useState<Step>("select");
  const [errorMsg, setErrorMsg] = useState("");
  const [fpReady, setFpReady] = useState(false);
  const [isCheckPayment, setIsCheckPayment] = useState(false);

  // Shared billing fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(prefillEmail);
  const [phone, setPhone] = useState("");

  // Card billing
  const [zipCode, setZipCode] = useState("");

  // ACH fields
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState<"checking" | "savings">("checking");

  // Token promise refs — wired up to PayFields callbacks
  const tokenResolveRef = useRef<((t: string) => void) | null>(null);
  const tokenRejectRef = useRef<((e: Error) => void) | null>(null);

  // Load and initialize FluidPay Pay Fields when card form is shown
  useEffect(() => {
    if (step !== "card_form" || !fluidpayPublicKey) return;

    setFpReady(false);

    function initPayFields() {
      const PF = (window as any).PayFields;
      if (!PF) return;

      PF.config.apiKey = fluidpayPublicKey;
      PF.config.onSuccess = (resp: any) => {
        tokenResolveRef.current?.(resp.token ?? resp.data?.token ?? resp);
        tokenResolveRef.current = null;
        tokenRejectRef.current = null;
      };
      PF.config.onError = (errors: any) => {
        const msg = Array.isArray(errors)
          ? errors.map((e: any) => (typeof e === "string" ? e : e?.message || JSON.stringify(e))).join(", ")
          : (typeof errors === "string" ? errors : "Card tokenization failed. Please check your details.");
        tokenRejectRef.current?.(new Error(msg));
        tokenResolveRef.current = null;
        tokenRejectRef.current = null;
      };

      PF.appendTo("#fp-card-number", "number");
      PF.appendTo("#fp-card-expiry", "expiry");
      PF.appendTo("#fp-card-cvv", "cvv");
      setFpReady(true);
    }

    const scriptId = "fluidpay-pay-fields-js";
    if (document.getElementById(scriptId)) {
      initPayFields();
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = `${fluidpayBaseUrl}/tokenizer/pay-fields.js`;
    script.async = true;
    script.onload = () => initPayFields();
    script.onerror = () => setErrorMsg("Failed to load payment fields. Please refresh and try again.");
    document.head.appendChild(script);
  }, [step, fluidpayPublicKey, fluidpayBaseUrl]);

  function getToken(): Promise<string> {
    return new Promise((resolve, reject) => {
      tokenResolveRef.current = resolve;
      tokenRejectRef.current = reject;
      (window as any).PayFields?.getToken();
    });
  }

  function goBack() {
    setStep("select");
    setErrorMsg("");
    setFpReady(false);
  }

  async function submit(method: "credit_card" | "ach") {
    setErrorMsg("");

    if (!firstName.trim() || !lastName.trim()) { setErrorMsg("Please enter your full name."); return; }
    if (!email.trim() || !email.includes("@")) { setErrorMsg("Please enter a valid email address."); return; }

    if (method === "ach") {
      if (routingNumber.length !== 9) { setErrorMsg("Routing number must be 9 digits."); return; }
      if (!accountNumber.trim()) { setErrorMsg("Please enter your account number."); return; }
    }

    setStep("processing");

    let token: string | undefined;
    if (method === "credit_card") {
      try {
        token = await getToken();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Card tokenization failed. Please check your details.");
        setStep("card_form");
        return;
      }
    }

    try {
      const res = await fetch(`/api/invoices/${invoiceId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: method,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          // Card: token from FluidPay tokenizer
          token: method === "credit_card" ? token : undefined,
          zipCode: method === "credit_card" ? zipCode.trim() || undefined : undefined,
          // ACH: direct fields
          routingNumber: method === "ach" ? routingNumber : undefined,
          accountNumber: method === "ach" ? accountNumber : undefined,
          accountType: method === "ach" ? accountType : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Payment failed. Please try again.");
      setStep("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Payment failed. Please try again.");
      setStep(method === "credit_card" ? "card_form" : "ach_form");
    }
  }

  // ── Method selection ──────────────────────────────────────────────────────
  if (step === "select") {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-700 mb-1">How would you like to pay?</p>
        {([
          { m: "credit_card" as PayMethod, label: "Credit / Debit Card", sub: "Visa, Mastercard, Amex, Discover", target: "card_form" as Step },
          { m: "ach" as PayMethod, label: "ACH / Bank Transfer", sub: "Direct from your checking or savings account", target: "ach_form" as Step },
          { m: "check" as PayMethod, label: "Check", sub: "Hand to your TTT coordinator", target: "check_confirm" as Step },
        ] as const).map(({ m, label, sub, target }) => (
          <button
            key={m}
            onClick={() => { setErrorMsg(""); setIsCheckPayment(m === "check"); setStep(target); }}
            className="w-full flex items-center gap-4 px-5 py-4 bg-white border-2 border-gray-200 hover:border-[#2E6B4F] hover:bg-[#f0fdf4] rounded-xl transition-colors text-left group"
          >
            <span className="text-xl">{m === "credit_card" ? "💳" : m === "ach" ? "🏦" : "📝"}</span>
            <span className="flex-1">
              <span className="block text-sm font-semibold text-gray-800 group-hover:text-[#2E6B4F]">{label}</span>
              <span className="block text-xs text-gray-400 mt-0.5">{sub}</span>
            </span>
            <svg className="w-4 h-4 text-gray-300 group-hover:text-[#2E6B4F] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>
    );
  }

  // ── Check confirmation ────────────────────────────────────────────────────
  if (step === "check_confirm") {
    return (
      <div className="space-y-5">
        <BackButton onClick={goBack} />
        <div className="bg-[#f0fdf4] border border-green-100 rounded-xl px-5 py-5 space-y-3">
          <p className="text-sm font-semibold text-[#2E6B4F]">Pay by Check</p>
          <p className="text-sm text-gray-600">Please make your check payable to:</p>
          <p className="text-base font-bold text-gray-900">{companyName}</p>
          <p className="text-sm text-gray-500">
            Hand the check to your Top Tier Transitions coordinator at your next appointment.
            Your invoice will be marked as paid once it is received.
          </p>
        </div>
        <div className="text-center text-xs text-gray-400">Invoice {invoiceNumber} · {fmt(amount)}</div>
        <button
          onClick={() => setStep("success")}
          className="w-full h-12 bg-[#2E6B4F] hover:bg-[#245a40] text-white font-bold rounded-xl text-base transition-colors"
        >
          Got it — I&apos;ll bring my check
        </button>
      </div>
    );
  }

  // ── Credit / Debit Card form (tokenizer) ──────────────────────────────────
  if (step === "card_form") {
    return (
      <div className="space-y-4">
        <BackButton onClick={goBack} />
        <p className="text-sm font-semibold text-gray-700 -mt-2">Credit / Debit Card</p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="First Name" value={firstName} onChange={setFirstName} placeholder="Jane" />
          <Field label="Last Name" value={lastName} onChange={setLastName} placeholder="Smith" />
        </div>

        {/* FluidPay tokenizer iframes */}
        {!fpReady && (
          <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-[#2E6B4F] rounded-full animate-spin" />
            Loading secure card fields…
          </div>
        )}
        <div style={{ display: fpReady ? undefined : "none" }}>
          <IframeField label="Card Number" id="fp-card-number" />
          <div className="grid grid-cols-2 gap-3 mt-4">
            <IframeField label="Expiration (MM/YY)" id="fp-card-expiry" />
            <IframeField label="CVC" id="fp-card-cvv" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Billing Zip Code" value={zipCode} onChange={v => setZipCode(v.replace(/\D/g, "").slice(0, 5))} placeholder="60601" inputMode="numeric" maxLength={5} />
          <Field label="Phone (optional)" value={phone} onChange={setPhone} type="tel" placeholder="3125551234" />
        </div>

        <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="jane@example.com" />

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          onClick={() => submit("credit_card")}
          disabled={!fpReady}
          className="w-full h-12 bg-[#2E6B4F] hover:bg-[#245a40] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-base transition-colors mt-2"
        >
          Pay {fmt(amount)}
        </button>
        <p className="text-center text-xs text-gray-400">Card details are captured securely by FluidPay and never touch our servers.</p>
      </div>
    );
  }

  // ── ACH form ──────────────────────────────────────────────────────────────
  if (step === "ach_form") {
    return (
      <div className="space-y-4">
        <BackButton onClick={goBack} />
        <p className="text-sm font-semibold text-gray-700 -mt-2">ACH / Bank Transfer</p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="First Name" value={firstName} onChange={setFirstName} placeholder="Jane" />
          <Field label="Last Name" value={lastName} onChange={setLastName} placeholder="Smith" />
        </div>

        <Field label="Routing Number" value={routingNumber} onChange={v => setRoutingNumber(v.replace(/\D/g, "").slice(0, 9))} placeholder="021000021" inputMode="numeric" maxLength={9} />
        <Field label="Account Number" value={accountNumber} onChange={setAccountNumber} placeholder="123456789" inputMode="numeric" />

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Account Type</label>
          <div className="flex gap-2">
            {(["checking", "savings"] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setAccountType(t)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${
                  accountType === t
                    ? "border-[#2E6B4F] bg-[#f0fdf4] text-[#2E6B4F]"
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="jane@example.com" />

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          onClick={() => submit("ach")}
          className="w-full h-12 bg-[#2E6B4F] hover:bg-[#245a40] text-white font-bold rounded-xl text-base transition-colors mt-2"
        >
          Pay {fmt(amount)}
        </button>
        <p className="text-center text-xs text-gray-400">ACH transfers typically settle within 1–3 business days.</p>
      </div>
    );
  }

  // ── Processing ────────────────────────────────────────────────────────────
  if (step === "processing") {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-4">
        <div className="w-10 h-10 border-4 border-[#2E6B4F] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Processing your payment…</p>
        <p className="text-xs text-gray-400 text-center">This may take up to a minute. Please don&apos;t close this page.</p>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (step === "success") {
    return (
      <div className="flex flex-col items-center text-center py-6 gap-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-[#2E6B4F]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="text-base font-bold text-gray-900">
            {isCheckPayment ? "Got it!" : "Payment Received!"}
          </p>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed max-w-xs mx-auto">
            {isCheckPayment
              ? `Please bring your check payable to ${companyName} to your next appointment.`
              : `Thank you! Your payment of ${fmt(amount)} has been processed. A receipt has been sent to ${email}.`}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
