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

function AmountHeader({ amount }: { amount: number }) {
  return (
    <div className="bg-[#f0fdf4] border border-green-100 rounded-xl px-5 py-4 text-center">
      <p className="text-xs text-[#2E6B4F] uppercase tracking-wide font-semibold mb-1">Amount Due</p>
      <p className="text-4xl font-bold text-[#2E6B4F]">{fmt(amount)}</p>
    </div>
  );
}

const CARD_SURCHARGE = 0.0399;

export function PaymentFlow({
  invoiceId, invoiceNumber, amount, companyName, prefillEmail = "",
  fluidpayPublicKey = "", fluidpayBaseUrl = "https://app.fluidpay.com",
}: Props) {
  const cardAmount = Math.round(amount * (1 + CARD_SURCHARGE) * 100) / 100;
  const surchargeDelta = cardAmount - amount;

  const [step, setStep] = useState<Step>("select");
  const [errorMsg, setErrorMsg] = useState("");
  const [fpReady, setFpReady] = useState(false);
  const [fpLoadError, setFpLoadError] = useState("");
  const [isCheckPayment, setIsCheckPayment] = useState(false);
  const [paidByCard, setPaidByCard] = useState(false);

  // Shared billing fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(prefillEmail);
  const [phone, setPhone] = useState("");
  const [zipCode, setZipCode] = useState("");

  // ACH fields
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState<"checking" | "savings">("checking");

  // FluidPay Tokenizer instance + token promise refs
  const tokenizerRef = useRef<any>(null);
  const tokenResolveRef = useRef<((t: string) => void) | null>(null);
  const tokenRejectRef = useRef<((e: Error) => void) | null>(null);

  useEffect(() => {
    if (step !== "card_form") return;

    setFpReady(false);
    setFpLoadError("");
    tokenizerRef.current = null;

    if (!fluidpayPublicKey) {
      setFpLoadError("Payment fields are not configured. Please contact your coordinator.");
      return;
    }

    function initTokenizer() {
      const TokClass = (window as any).Tokenizer;
      if (!TokClass) {
        setFpLoadError("Payment fields failed to initialize. Please refresh and try again.");
        return;
      }

      try {
        tokenizerRef.current = new TokClass({
          url: fluidpayBaseUrl,
          apikey: fluidpayPublicKey,
          container: "#fp-tokenizer-container",
          onLoad: () => setFpReady(true),
          submission: (resp: any) => {
            if (resp.status === "success") {
              tokenResolveRef.current?.(resp.token);
            } else if (resp.status === "validation") {
              const fields = Array.isArray(resp.invalid) ? resp.invalid.join(", ") : "card details";
              tokenRejectRef.current?.(new Error(`Please check your ${fields}.`));
            } else {
              tokenRejectRef.current?.(new Error(resp.msg || "Card tokenization failed. Please try again."));
            }
            tokenResolveRef.current = null;
            tokenRejectRef.current = null;
          },
        });
      } catch (e) {
        console.error("[Tokenizer] init error:", e);
        setFpLoadError("Payment fields failed to initialize. Please refresh and try again.");
      }
    }

    const loadTimeout = setTimeout(() => {
      if (!(window as any).Tokenizer) {
        setFpLoadError("Payment fields timed out. Please check your connection and refresh.");
      }
    }, 15_000);

    const scriptId = "fluidpay-tokenizer-js";
    if (document.getElementById(scriptId)) {
      clearTimeout(loadTimeout);
      initTokenizer();
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = `${fluidpayBaseUrl}/tokenizer/tokenizer.js`;
    script.async = true;
    script.onload = () => { clearTimeout(loadTimeout); initTokenizer(); };
    script.onerror = () => {
      clearTimeout(loadTimeout);
      console.error("[Tokenizer] script failed to load:", script.src);
      setFpLoadError("Failed to load secure payment fields. Please refresh and try again.");
    };
    document.head.appendChild(script);

    return () => clearTimeout(loadTimeout);
  }, [step, fluidpayPublicKey, fluidpayBaseUrl]);

  function getToken(): Promise<string> {
    return new Promise((resolve, reject) => {
      tokenResolveRef.current = resolve;
      tokenRejectRef.current = reject;
      tokenizerRef.current?.submit();
    });
  }

  function goBack() {
    setStep("select");
    setErrorMsg("");
    setFpReady(false);
    setFpLoadError("");
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
          token: method === "credit_card" ? token : undefined,
          zipCode: method === "credit_card" ? zipCode.trim() || undefined : undefined,
          routingNumber: method === "ach" ? routingNumber : undefined,
          accountNumber: method === "ach" ? accountNumber : undefined,
          accountType: method === "ach" ? accountType : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Payment failed. Please try again.");
      setPaidByCard(method === "credit_card");
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
        {/* Dynamic amount display */}
        <div className="bg-[#f0fdf4] border border-green-100 rounded-xl px-5 py-4 mb-2 text-center">
          <p className="text-xs text-[#2E6B4F] uppercase tracking-wide font-semibold mb-1">Amount Due</p>
          <p className="text-4xl font-bold text-[#2E6B4F]">{fmt(amount)}</p>
          <p className="text-xs text-gray-400 mt-1">ACH / Cash / Check price</p>
        </div>

        <p className="text-sm font-semibold text-gray-700 mb-1">How would you like to pay?</p>
        {([
          {
            m: "credit_card" as PayMethod,
            label: "Credit / Debit Card",
            sub: "Visa, Mastercard, Amex, Discover",
            target: "card_form" as Step,
            displayAmount: fmt(cardAmount),
            feeNote: `+3.99%`,
          },
          {
            m: "ach" as PayMethod,
            label: "ACH / Bank Transfer",
            sub: "Direct from your checking or savings account",
            target: "ach_form" as Step,
            displayAmount: fmt(amount),
            feeNote: null,
          },
          {
            m: "check" as PayMethod,
            label: "Check",
            sub: "Hand to your TTT coordinator",
            target: "check_confirm" as Step,
            displayAmount: fmt(amount),
            feeNote: null,
          },
        ] as const).map(({ m, label, sub, target, displayAmount, feeNote }) => (
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
            <span className="text-right flex-shrink-0">
              <span className="block text-sm font-bold text-gray-800 group-hover:text-[#2E6B4F]">{displayAmount}</span>
              {feeNote && <span className="block text-xs text-amber-600 mt-0.5">{feeNote}</span>}
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
        <AmountHeader amount={amount} />
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

  // ── Credit / Debit Card form ──────────────────────────────────────────────
  if (step === "card_form") {
    return (
      <div className="space-y-4">
        <BackButton onClick={goBack} />

        {/* Toggled-up amount */}
        <div className="bg-[#f0fdf4] border border-green-100 rounded-xl px-5 py-4 text-center">
          <p className="text-xs text-[#2E6B4F] uppercase tracking-wide font-semibold mb-1">Card Payment Amount</p>
          <p className="text-4xl font-bold text-[#2E6B4F]">{fmt(cardAmount)}</p>
          <p className="text-xs text-gray-400 mt-1">Excludes 3.99% ACH/Check Discount</p>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 leading-relaxed">
          <span className="font-semibold text-amber-700">Disclaimer:</span> Please note that all invoices are presented as the ACH, Cash, or discounted price. The credit card amount is the full price of our services.
        </p>

        <p className="text-sm font-semibold text-gray-700">Credit / Debit Card</p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="First Name" value={firstName} onChange={setFirstName} placeholder="Jane" />
          <Field label="Last Name" value={lastName} onChange={setLastName} placeholder="Smith" />
        </div>

        {!fpReady && !fpLoadError && (
          <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-[#2E6B4F] rounded-full animate-spin" />
            Loading secure card fields…
          </div>
        )}
        {fpLoadError && <p className="text-sm text-red-600 py-2">{fpLoadError}</p>}

        {/* FluidPay Tokenizer renders card fields here — use height:0/overflow:hidden instead of
            display:none so the iframe initializes at the correct container width */}
        <div id="fp-tokenizer-container" style={fpReady ? {} : { height: 0, overflow: "hidden" }} />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Billing Zip Code" value={zipCode} onChange={v => setZipCode(v.replace(/\D/g, "").slice(0, 5))} placeholder="60601" inputMode="numeric" maxLength={5} />
          <Field label="Phone (optional)" value={phone} onChange={setPhone} type="tel" placeholder="3125551234" />
        </div>
        <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="jane@example.com" />

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          onClick={() => submit("credit_card")}
          disabled={!fpReady || !!fpLoadError}
          className="w-full h-12 bg-[#2E6B4F] hover:bg-[#245a40] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-base transition-colors mt-2"
        >
          Pay {fmt(cardAmount)}
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
        <AmountHeader amount={amount} />
        <p className="text-sm font-semibold text-gray-700">ACH / Bank Transfer</p>

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
              <button key={t} type="button" onClick={() => setAccountType(t)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${
                  accountType === t ? "border-[#2E6B4F] bg-[#f0fdf4] text-[#2E6B4F]" : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}>
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
          <p className="text-base font-bold text-gray-900">{isCheckPayment ? "Got it!" : "Payment Received!"}</p>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed max-w-xs mx-auto">
            {isCheckPayment
              ? `Please bring your check payable to ${companyName} to your next appointment.`
              : `Thank you! Your payment of ${fmt(paidByCard ? cardAmount : amount)} has been processed. A receipt has been sent to ${email}.`}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
