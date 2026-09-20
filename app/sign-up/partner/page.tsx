"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { isNativeApp } from "@/lib/native";

const TYPE_LABELS: Record<string, string> = {
  "Senior Living": "Senior Living Partner",
  "Realtor": "Realtor",
  "Moving Company": "Moving Company",
  "Other": "Other Partner",
};

function PartnerSignUpContent() {
  const searchParams = useSearchParams();
  const rawType = searchParams.get("type") || "Other";
  const partnerType = TYPE_LABELS[rawType] ? rawType : "Other";
  const label = TYPE_LABELS[partnerType];

  const [step, setStep] = useState<"details" | "signup">("details");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");

  const canContinue = companyName.trim().length > 0;

  const applyUrl = `/api/partner/apply?type=${encodeURIComponent(partnerType)}&company=${encodeURIComponent(companyName.trim())}${phone.trim() ? `&phone=${encodeURIComponent(phone.trim())}` : ""}`;

  // Google OAuth doesn't work inside the Capacitor app's embedded webview —
  // same fix already applied on the main sign-in/sign-up pages.
  const hideSocialButtons = isNativeApp();

  return (
    <div className="min-h-screen bg-cream-50 flex flex-col items-center px-6 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center gap-2.5 mb-8">
          <Image src="/ttt-icon.png" alt="Top Tier Transitions" width={32} height={32} className="w-8 h-8 object-contain" />
          <div>
            <div className="font-bold text-forest-700 leading-none text-sm">Rightsize</div>
            <div className="text-[10px] text-gray-400">by Top Tier</div>
          </div>
        </Link>

        <div className="inline-flex items-center gap-1.5 bg-forest-50 border border-forest-200 text-forest-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
          {label} Account
        </div>

        {step === "details" ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-1.5">Tell us about your business</h1>
            <p className="text-sm text-gray-500 mb-7 leading-relaxed">
              A few details so our team can recognize you once you&rsquo;re signed up — you can fill in the rest later.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {partnerType === "Realtor" ? "Brokerage name" : "Company / organization name"}
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={
                    partnerType === "Senior Living" ? "e.g. Sunrise Senior Living" :
                    partnerType === "Realtor" ? "e.g. Keller Williams" :
                    partnerType === "Moving Company" ? "e.g. Swift Movers" :
                    "Your company or firm"
                  }
                  className="w-full h-12 px-3.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 555-5555"
                  className="w-full h-12 px-3.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => canContinue && setStep("signup")}
              disabled={!canContinue}
              className="w-full h-12 mt-7 rounded-xl bg-forest-600 text-white font-semibold text-sm hover:bg-forest-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] transition-all"
            >
              Continue
            </button>

            <p className="text-center text-xs text-gray-400 mt-5">
              Not a referral partner?{" "}
              <Link href="/" className="text-forest-700 font-medium hover:underline">Go back</Link>
            </p>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setStep("details")}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-4"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {companyName}
            </button>
            <h1 className="text-2xl font-bold text-gray-900 mb-1.5">Create your account</h1>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              Last step — this becomes your Partner Portal login for {companyName}.
            </p>
            <SignUp
              forceRedirectUrl={applyUrl}
              appearance={{
                elements: {
                  rootBox: "w-full",
                  card: "shadow-md rounded-2xl border border-cream-200",
                  headerTitle: "text-gray-900 font-bold",
                  primaryButton: "bg-forest-600 hover:bg-forest-700 text-white rounded-xl h-12",
                  socialButtonsBlockButton: "border border-gray-300 rounded-xl h-12 hover:bg-gray-50",
                  formFieldInput: "rounded-xl h-12 border-gray-300",
                  socialButtons: hideSocialButtons ? "hidden" : undefined,
                  dividerRow: hideSocialButtons ? "hidden" : undefined,
                },
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default function PartnerSignUpPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream-50" />}>
      <PartnerSignUpContent />
    </Suspense>
  );
}
