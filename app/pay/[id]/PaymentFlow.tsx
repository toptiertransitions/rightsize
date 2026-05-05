"use client";

import { useState, useEffect, useRef } from "react";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Tokenizer: new (config: any) => { submit: () => void };
  }
}

type PayMethod = "credit_card" | "ach" | "check";
type Step = "select" | "check_confirm" | "card_form" | "processing" | "success" | "error";

interface Props {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  companyName: string;
  fluidpayPublicKey: string;
  fluidpayUrl: string;
}

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Tokenizer sub-component — mounts once, unmounts when back is pressed ─────
function TokenizerForm({
  invoiceId,
  amount,
  payMethod,
  fluidpayPublicKey,
  fluidpayUrl,
  onBack,
  onProcessing,
  onSuccess,
  onError,
}: {
  invoiceId: string;
  amount: number;
  payMethod: PayMethod;
  fluidpayPublicKey: string;
  fluidpayUrl: string;
  onBack: () => void;
  onProcessing: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const tokenizerRef = useRef<{ submit: () => void } | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [initError, setInitError] = useState("");

  // Load script once, then init tokenizer after the container div exists
  useEffect(() => {
    let cancelled = false;

    function initTokenizer() {
      if (cancelled || !window.Tokenizer) return;
      try {
        tokenizerRef.current = new window.Tokenizer({
          url: fluidpayUrl,
          apikey: fluidpayPublicKey,
          container: "#fluidpay-container",
          submission: async (resp: { status: string; token?: string; msg?: string }) => {
            if (resp.status !== "success" || !resp.token) {
              onError(resp.msg || "Tokenization failed — please check your details and try again.");
              return;
            }
            onProcessing();
            try {
              const res = await fetch(`/api/invoices/${invoiceId}/pay`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: resp.token, paymentMethod: payMethod }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data.error || "Payment was declined. Please try again.");
              onSuccess();
            } catch (err) {
              onError(err instanceof Error ? err.message : "Payment failed. Please try again.");
            }
          },
        });
        setScriptReady(true);
      } catch (e) {
        setInitError("Failed to load payment form. Please refresh and try again.");
      }
    }

    if (window.Tokenizer) {
      initTokenizer();
      return () => { cancelled = true; };
    }

    // Script not yet loaded
    const existing = document.querySelector(`script[src*="tokenizer.js"]`);
    if (existing) {
      // Script tag exists but Tokenizer may not be ready yet
      const interval = setInterval(() => {
        if (window.Tokenizer) { clearInterval(interval); initTokenizer(); }
      }, 100);
      return () => { cancelled = true; clearInterval(interval); };
    }

    const script = document.createElement("script");
    script.src = `${fluidpayUrl}/tokenizer/tokenizer.js`;
    script.onload = () => { if (!cancelled) initTokenizer(); };
    script.onerror = () => { if (!cancelled) setInitError("Failed to load payment form. Please refresh and try again."); };
    document.head.appendChild(script);

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const label = payMethod === "ach" ? "ACH / Bank Transfer" : "Credit Card";

  return (
    <div className="space-y-5">
      {/* Back + label */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Back"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <p className="text-sm font-semibold text-gray-700">{label}</p>
      </div>

      {/* FluidPay tokenizer mounts here */}
      <div
        id="fluidpay-container"
        className="min-h-[180px] rounded-xl border border-gray-200 overflow-hidden"
      />

      {initError && <p className="text-sm text-red-600">{initError}</p>}

      {scriptReady && (
        <button
          onClick={() => tokenizerRef.current?.submit()}
          className="w-full h-12 bg-[#2E6B4F] hover:bg-[#245a40] text-white font-bold rounded-xl text-base transition-colors"
        >
          Pay {fmt(amount)}
        </button>
      )}

      {!scriptReady && !initError && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-gray-400">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-[#2E6B4F] rounded-full animate-spin" />
          Loading payment form…
        </div>
      )}
    </div>
  );
}

// ─── Main payment flow ─────────────────────────────────────────────────────────
export function PaymentFlow({
  invoiceId,
  invoiceNumber,
  amount,
  companyName,
  fluidpayPublicKey,
  fluidpayUrl,
}: Props) {
  const [step, setStep] = useState<Step>("select");
  const [payMethod, setPayMethod] = useState<PayMethod | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  // Key increments when user goes back to force a fresh tokenizer mount
  const [tokenizerKey, setTokenizerKey] = useState(0);

  function selectMethod(m: PayMethod) {
    setPayMethod(m);
    setErrorMsg("");
    setStep(m === "check" ? "check_confirm" : "card_form");
  }

  function goBack() {
    setTokenizerKey(k => k + 1); // remount tokenizer on re-entry
    setStep("select");
    setErrorMsg("");
  }

  // ── Method selection ────────────────────────────────────────────────────────
  if (step === "select") {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-700 mb-1">How would you like to pay?</p>
        {([
          { m: "credit_card" as PayMethod, label: "Credit Card", sub: "Visa, Mastercard, Amex, Discover" },
          { m: "ach" as PayMethod, label: "ACH / Bank Transfer", sub: "Direct from your bank account" },
          { m: "check" as PayMethod, label: "Check", sub: "Hand to your TTT coordinator" },
        ] as const).map(({ m, label, sub }) => (
          <button
            key={m}
            onClick={() => selectMethod(m)}
            className="w-full flex items-center gap-4 px-5 py-4 bg-white border-2 border-gray-200 hover:border-[#2E6B4F] hover:bg-[#f0fdf4] rounded-xl transition-colors text-left group"
          >
            <span className="text-xl">
              {m === "credit_card" ? "💳" : m === "ach" ? "🏦" : "📝"}
            </span>
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

  // ── Check confirmation ──────────────────────────────────────────────────────
  if (step === "check_confirm") {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <button onClick={goBack} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Back">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <p className="text-sm font-semibold text-gray-700">Pay by Check</p>
        </div>
        <div className="bg-[#f0fdf4] border border-green-100 rounded-xl px-5 py-5 space-y-3">
          <p className="text-sm text-gray-600">Please make your check payable to:</p>
          <p className="text-base font-bold text-[#2E6B4F]">{companyName}</p>
          <p className="text-sm text-gray-500">
            Hand the check to your Top Tier Transitions coordinator at your next appointment.
            Your invoice will be marked as paid once it is received.
          </p>
        </div>
        <div className="text-center text-xs text-gray-400">
          Invoice {invoiceNumber} · {fmt(amount)}
        </div>
        <button
          onClick={() => setStep("success")}
          className="w-full h-12 bg-[#2E6B4F] hover:bg-[#245a40] text-white font-bold rounded-xl text-base transition-colors"
        >
          Got it — I&apos;ll bring my check
        </button>
      </div>
    );
  }

  // ── Card / ACH form ─────────────────────────────────────────────────────────
  if (step === "card_form" && payMethod) {
    return (
      <>
        {errorMsg && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-sm text-red-700">{errorMsg}</p>
          </div>
        )}
        <TokenizerForm
          key={tokenizerKey}
          invoiceId={invoiceId}
          amount={amount}
          payMethod={payMethod}
          fluidpayPublicKey={fluidpayPublicKey}
          fluidpayUrl={fluidpayUrl}
          onBack={goBack}
          onProcessing={() => setStep("processing")}
          onSuccess={() => setStep("success")}
          onError={(msg) => { setErrorMsg(msg); setStep("card_form"); }}
        />
      </>
    );
  }

  // ── Processing spinner ──────────────────────────────────────────────────────
  if (step === "processing") {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-4">
        <div className="w-10 h-10 border-4 border-[#2E6B4F] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Processing your payment…</p>
      </div>
    );
  }

  // ── Success ─────────────────────────────────────────────────────────────────
  if (step === "success") {
    const isCheck = payMethod === "check";
    return (
      <div className="flex flex-col items-center text-center py-6 gap-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-[#2E6B4F]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="text-base font-bold text-gray-900">
            {isCheck ? "Got it!" : "Payment received!"}
          </p>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            {isCheck
              ? "Please bring your check payable to " + companyName + " to your next appointment."
              : "Thank you! Your payment of " + fmt(amount) + " has been processed. Your coordinator will follow up shortly."}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
