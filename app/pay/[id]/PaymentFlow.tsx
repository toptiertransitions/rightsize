"use client";

import { useState } from "react";

type PayMethod = "credit_card" | "ach" | "check";
type Step = "select" | "check_confirm" | "card_form" | "ach_form" | "processing" | "success";

interface Props {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  companyName: string;
  prefillEmail?: string;
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

export function PaymentFlow({ invoiceId, invoiceNumber, amount, companyName, prefillEmail = "" }: Props) {
  const [step, setStep] = useState<Step>("select");
  const [errorMsg, setErrorMsg] = useState("");

  // Shared billing fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(prefillEmail);
  const [phone, setPhone] = useState("");

  // Card fields
  const [cardNumber, setCardNumber] = useState("");
  const [expiration, setExpiration] = useState("");
  const [cvc, setCvc] = useState("");

  // ACH fields
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState<"checking" | "savings">("checking");

  function goBack() {
    setStep("select");
    setErrorMsg("");
  }

  async function submit(method: "credit_card" | "ach") {
    setErrorMsg("");

    // Basic client-side validation
    if (!firstName.trim() || !lastName.trim()) { setErrorMsg("Please enter your full name."); return; }
    if (!email.trim() || !email.includes("@")) { setErrorMsg("Please enter a valid email address."); return; }

    if (method === "credit_card") {
      const digits = cardNumber.replace(/\s/g, "");
      if (digits.length < 13) { setErrorMsg("Please enter a valid card number."); return; }
      if (!expiration.match(/^\d{2}\/\d{2}$/)) { setErrorMsg("Expiration must be MM/YY."); return; }
      if (!cvc || cvc.length < 3) { setErrorMsg("Please enter the CVC."); return; }
    } else {
      if (routingNumber.length !== 9) { setErrorMsg("Routing number must be 9 digits."); return; }
      if (!accountNumber.trim()) { setErrorMsg("Please enter your account number."); return; }
    }

    setStep("processing");
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
          // Card fields
          cardNumber: method === "credit_card" ? cardNumber.replace(/\s/g, "") : undefined,
          expirationDate: method === "credit_card" ? expiration : undefined,
          cvc: method === "credit_card" ? cvc : undefined,
          // ACH fields
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
            onClick={() => { setErrorMsg(""); setStep(target); }}
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

  // ── Credit / Debit Card form ───────────────────────────────────────────────
  if (step === "card_form") {
    return (
      <div className="space-y-4">
        <BackButton onClick={goBack} />
        <p className="text-sm font-semibold text-gray-700 -mt-2">Credit / Debit Card</p>

        {/* Name row */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="First Name" value={firstName} onChange={setFirstName} placeholder="Jane" />
          <Field label="Last Name" value={lastName} onChange={setLastName} placeholder="Smith" />
        </div>

        <Field
          label="Card Number"
          value={cardNumber}
          onChange={v => setCardNumber(v.replace(/[^\d\s]/g, "").slice(0, 19))}
          placeholder="4111 1111 1111 1111"
          inputMode="numeric"
          maxLength={19}
        />

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Expiration (MM/YY)"
            value={expiration}
            onChange={v => {
              const digits = v.replace(/\D/g, "").slice(0, 4);
              setExpiration(digits.length > 2 ? digits.slice(0, 2) + "/" + digits.slice(2) : digits);
            }}
            placeholder="12/26"
            inputMode="numeric"
            maxLength={5}
          />
          <Field label="CVC" value={cvc} onChange={setCvc} placeholder="123" inputMode="numeric" maxLength={4} />
        </div>

        <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="jane@example.com" />
        <Field label="Phone (optional)" value={phone} onChange={setPhone} type="tel" placeholder="3125551234" />

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          onClick={() => submit("credit_card")}
          className="w-full h-12 bg-[#2E6B4F] hover:bg-[#245a40] text-white font-bold rounded-xl text-base transition-colors mt-2"
        >
          Pay {fmt(amount)}
        </button>
        <p className="text-center text-xs text-gray-400">Your card details are encrypted and never stored.</p>
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

        {/* Account type toggle */}
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
    const isCheck = step === "success" && !cardNumber && !routingNumber;
    return (
      <div className="flex flex-col items-center text-center py-6 gap-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-[#2E6B4F]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="text-base font-bold text-gray-900">
            {isCheck ? "Got it!" : "Payment Received!"}
          </p>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed max-w-xs mx-auto">
            {isCheck
              ? `Please bring your check payable to ${companyName} to your next appointment.`
              : `Thank you! Your payment of ${fmt(amount)} has been processed. A receipt has been sent to ${email}.`}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
