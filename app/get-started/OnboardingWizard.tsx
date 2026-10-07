"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ProgressBar, BackLink, BottomCTA } from "@/components/onboarding/shared";
import { Step1About, step1Valid } from "./steps/Step1About";
import { Step2Interests, step2Valid } from "./steps/Step2Interests";
import { Step3Timeline, step3Valid } from "./steps/Step3Timeline";
import { Step4Destination, step4Valid } from "./steps/Step4Destination";
import { Step5Starting, step5Valid } from "./steps/Step5Starting";
import { Step6Layout } from "./steps/Step6Layout";
import { Step7Referral, step7Valid } from "./steps/Step7Referral";
import { Step7Done } from "./steps/Step7Done";
import type { WizardData } from "./wizardTypes";
import { submitStep1, submitStep2, submitStep3, submitStep4, submitStep5, completeOnboarding, submitStep7, finishOnboardingTour } from "./actions";
import { logOnboardingEvent } from "@/lib/onboarding/analytics";

const TOTAL_STEPS = 7; // the progress bar tracks steps 1-7; step 8 is the completion screen
const DONE_STEP = 8;

interface Props {
  initialStep: number;
  initialTenantId: string | null;
  initialData: WizardData;
}

export function OnboardingWizard({ initialStep, initialTenantId, initialData }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 1), DONE_STEP));
  const [tenantId, setTenantId] = useState<string | null>(initialTenantId);
  const [data, setData] = useState<WizardData>(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const viewedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!viewedRef.current.has(step)) {
      viewedRef.current.add(step);
      logOnboardingEvent("step_viewed", { step, tenantId });
    }
  }, [step, tenantId]);

  const update = useCallback((patch: Partial<WizardData>) => setData(prev => ({ ...prev, ...patch })), []);

  function goBack() {
    setError("");
    setStep(s => Math.max(1, s - 1));
  }

  const canContinue = (() => {
    switch (step) {
      case 1: return step1Valid(data);
      case 2: return step2Valid(data);
      case 3: return step3Valid(data);
      case 4: return step4Valid(data);
      case 5: return step5Valid(data);
      case 6: return true;
      case 7: return step7Valid(data);
      default: return false;
    }
  })();

  async function handleContinue() {
    setError("");
    setSaving(true);
    try {
      if (step === 1) {
        const res = await submitStep1({ firstName: data.firstName.trim(), lastName: data.lastName.trim(), currentZip: data.currentZip });
        setTenantId(res.tenantId);
        setStep(2);
      } else if (step === 2) {
        if (!tenantId) throw new Error("Missing project");
        await submitStep2(tenantId, { serviceInterests: data.serviceInterests, appOnlyIntent: data.appOnlyIntent });
        setStep(3);
      } else if (step === 3) {
        if (!tenantId) throw new Error("Missing project");
        await submitStep3(tenantId, { timelineType: data.timelineType!, timelineValue: data.timelineValue });
        setStep(4);
      } else if (step === 4) {
        if (!tenantId) throw new Error("Missing project");
        await submitStep4(tenantId, {
          destinationType: data.destinationType!,
          destinationZip: data.destinationZip,
          destinationCommunity: data.destinationCommunity,
          destinationCommunityOther: data.destinationCommunityOther,
        });
        setStep(5);
      } else if (step === 5) {
        if (!tenantId) throw new Error("Missing project");
        await submitStep5(tenantId, { sqftRange: data.sqftRange!, sqftExact: data.sqftExact ?? undefined, homeDensity: data.homeDensity! });
        setStep(6);
      } else if (step === 6) {
        if (!tenantId) throw new Error("Missing project");
        await completeOnboarding(tenantId, {
          bedrooms: data.bedrooms,
          bathrooms: data.bathrooms,
          spaces: data.spaces.map(s => ({ key: s.key, name: s.name, on: s.on })),
        });
        setStep(7);
      } else if (step === 7) {
        if (!tenantId) throw new Error("Missing project");
        await submitStep7(tenantId, {
          howHeard: data.howHeard,
          howHeardDetail: data.howHeardDetail.trim(),
          referralPartnerId: data.referralPartnerId,
        });
        setStep(DONE_STEP);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // The "I just want to use the app" link both sets appOnlyIntent and submits
  // in one tap — built as its own path rather than routed through
  // handleContinue() because handleContinue reads `data` from this closure,
  // which wouldn't yet reflect the update() call queued in the same click.
  async function handleAppOnlyAdvance() {
    setError("");
    setSaving(true);
    try {
      if (!tenantId) throw new Error("Missing project");
      await submitStep2(tenantId, { serviceInterests: [], appOnlyIntent: true });
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // Enter key advances on desktop
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter" || saving || step === DONE_STEP || !canContinue) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA") return;
      handleContinue();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, canContinue, saving, data, tenantId]);

  const finishingRef = useRef(false);
  async function handleFinish() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    try {
      if (tenantId) await finishOnboardingTour(tenantId);
    } catch {
      // If this fails, onboardingComplete stays false and the user simply
      // resumes the tour next time they load /get-started — safe fallback,
      // so we still let them into the app now rather than trap them here.
    } finally {
      router.push("/home");
    }
  }

  return (
    <div className="h-[100dvh] bg-cream-50 flex flex-col overflow-hidden">
      {step < DONE_STEP && (
        <div className="w-full max-w-md mx-auto px-6 pt-[max(20px,env(safe-area-inset-top))] pb-3 shrink-0">
          <div className="flex items-center gap-3 mb-3">
            {step > 1 ? <BackLink onClick={goBack} /> : <div className="w-11 shrink-0" />}
            <div className="flex-1"><ProgressBar step={step} total={TOTAL_STEPS} /></div>
          </div>
          <p className="text-[11px] font-semibold text-forest-600 uppercase tracking-wide">
            Let&apos;s customize your Rightsize experience
          </p>
        </div>
      )}

      <div className="flex-1 overflow-hidden relative">
        <div
          className="flex h-full w-full transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${(Math.min(step, DONE_STEP) - 1) * 100}%)` }}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
            <div key={n} className="w-full h-full shrink-0 overflow-y-auto px-6 pb-4">
              <div className="max-w-md mx-auto pt-2">
                {n === 1 && <Step1About data={data} update={update} />}
                {n === 2 && <Step2Interests data={data} update={update} onAppOnlyAdvance={handleAppOnlyAdvance} />}
                {n === 3 && <Step3Timeline data={data} update={update} />}
                {n === 4 && <Step4Destination data={data} update={update} />}
                {n === 5 && <Step5Starting data={data} update={update} />}
                {n === 6 && <Step6Layout data={data} update={update} />}
                {n === 7 && <Step7Referral data={data} update={update} />}
                {n === 8 && <Step7Done data={data} firstName={data.firstName} onFinish={handleFinish} />}
              </div>
            </div>
          ))}
        </div>
      </div>

      {step < DONE_STEP && (
        <div className="w-full max-w-md mx-auto px-6 shrink-0">
          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
          <BottomCTA onClick={handleContinue} disabled={!canContinue} loading={saving} />
        </div>
      )}
    </div>
  );
}
