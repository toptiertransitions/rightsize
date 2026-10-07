"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { PartyPopper, Home, CalendarDays, Camera, Handshake } from "lucide-react";
import { ProgressBar, BackLink, BottomCTA } from "@/components/onboarding/shared";
import { Step3Timeline, step3Valid } from "@/app/get-started/steps/Step3Timeline";
import { Step4Destination, step4Valid } from "@/app/get-started/steps/Step4Destination";
import { OnboardingTour, type Slide } from "@/app/get-started/steps/OnboardingTour";
import { emptyWizardData, type WizardData } from "@/app/get-started/wizardTypes";
import { saveWelcomeName, saveWelcomeTimeline, saveWelcomeDestination, finishWelcome, getWelcomeContext } from "./actions";

// First-time TTT clients land here straight from sign-up (or from accepting
// an invite while signed in). The page is public in middleware on purpose:
// right after sign-up the new session can take a moment to reach the
// server, and a server-side auth check here is what used to bounce people
// through the sign-in page for a split second. We wait for Clerk on the
// client instead, behind one steady "Setting up your account" screen.

const TOTAL_STEPS = 3; // name, timeline, destination; step 4 is the tour
const TOUR_STEP = 4;

type Phase = "connecting" | "wizard" | "error";

function ttTSlides(firstName: string, projectName: string): Slide[] {
  return [
    {
      icon: <PartyPopper className="w-9 h-9" />,
      title: `Welcome, ${firstName || "there"}.`,
      body: `Your ${projectName} project is ready. Here's a quick, 60-second look at how Rightsize works with your Top Tier team.`,
      nextLabel: "Show me around",
    },
    {
      icon: <Home className="w-9 h-9" />,
      title: "Your Home Base",
      body: "Start here every time. See what's coming up, how your move is going, and get to any part of it from one simple place.",
      nextLabel: "Next",
    },
    {
      icon: <CalendarDays className="w-9 h-9" />,
      title: "Your Move, Day by Day",
      body: "The Plan page shows your schedule, who's coming, and every key date. Your Team Lead's number is right there if you need them.",
      nextLabel: "Next",
    },
    {
      icon: <Camera className="w-9 h-9" />,
      title: "Everything We Catalog",
      body: "Your Top Tier team photographs and catalogs your belongings. See each item, what it's worth, and where it's headed.",
      nextLabel: "Next",
    },
    {
      icon: <Handshake className="w-9 h-9" />,
      title: "Your Trusted Partners",
      body: "Realtors, movers, and other vetted help for your move, all in one place on your Partners page.",
      nextLabel: "Go to my home page",
    },
  ];
}

function Splash({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <div className="h-[100dvh] bg-cream-50 flex flex-col items-center justify-center px-6 text-center">
      <div className="w-12 h-12 rounded-2xl bg-forest-600 flex items-center justify-center mb-5">
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </div>
      {!children && (
        <svg className="animate-spin h-5 w-5 text-forest-500 mb-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      <p className="text-base font-medium text-gray-700">{message}</p>
      {children}
    </div>
  );
}

export function WelcomeClient() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const { isLoaded, isSignedIn } = useAuth();

  const [phase, setPhase] = useState<Phase>("connecting");
  const [errorMsg, setErrorMsg] = useState("");
  const [tenantId, setTenantId] = useState<string | null>(params.get("tenantId"));
  const [projectName, setProjectName] = useState("");
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(() => emptyWizardData());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const started = useRef(false);

  const update = useCallback((patch: Partial<WizardData>) => setData(prev => ({ ...prev, ...patch })), []);
  const tourSlides = useMemo(() => ttTSlides(data.firstName, projectName), [data.firstName, projectName]);

  const enterWizard = useCallback(async (tid: string) => {
    const ctx = await getWelcomeContext(tid);
    setTenantId(tid);
    setProjectName(ctx.projectName);
    setData(prev => ({ ...prev, firstName: ctx.firstName, lastName: ctx.lastName }));
    setPhase("wizard");
  }, []);

  // Wait for the session, accept the invite, then onboard or go Home
  useEffect(() => {
    if (!isLoaded || started.current) return;

    if (!isSignedIn) {
      // A brand-new session can lag a moment behind sign-up; give it a
      // beat before deciding this person really needs to sign in.
      const t = setTimeout(() => {
        if (!started.current) {
          const back = `/welcome${window.location.search}`;
          router.replace(`/sign-in?redirect_url=${encodeURIComponent(back)}`);
        }
      }, 4000);
      return () => clearTimeout(t);
    }

    started.current = true;
    (async () => {
      try {
        if (token) {
          let res: Response | null = null;
          for (let attempt = 0; attempt < 4; attempt++) {
            res = await fetch(`/api/invites/${encodeURIComponent(token)}`, { method: "POST" });
            if (res.status !== 401) break;
            await new Promise(r => setTimeout(r, 750));
          }
          const body = await res!.json().catch(() => ({}));
          if (!res!.ok) throw new Error(body.error || "This invite couldn't be accepted.");
          if (body.redirect === "/vendor" || body.vendorId) { router.replace("/vendor"); return; }
          if (!body.needsOnboarding) { router.replace("/home"); return; }
          await enterWizard(body.tenantId);
        } else if (tenantId) {
          await enterWizard(tenantId);
        } else {
          router.replace("/home");
        }
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Something went wrong.");
        setPhase("error");
      }
    })();
  }, [isLoaded, isSignedIn, token, tenantId, router, enterWizard]);

  const canContinue =
    step === 1 ? data.firstName.trim().length > 0 && data.lastName.trim().length > 0
    : step === 2 ? step3Valid(data)
    : step === 3 ? step4Valid(data)
    : false;

  async function handleContinue() {
    if (!tenantId) return;
    setError("");
    setSaving(true);
    try {
      if (step === 1) {
        await saveWelcomeName(tenantId, { firstName: data.firstName.trim(), lastName: data.lastName.trim() });
        setStep(2);
      } else if (step === 2) {
        await saveWelcomeTimeline(tenantId, { timelineType: data.timelineType!, timelineValue: data.timelineValue });
        setStep(3);
      } else if (step === 3) {
        await saveWelcomeDestination(tenantId, {
          destinationType: data.destinationType!,
          destinationZip: data.destinationZip,
          destinationCommunity: data.destinationCommunity,
          destinationCommunityOther: data.destinationCommunityOther,
        });
        setStep(TOUR_STEP);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // Enter key advances on desktop, same as self-serve
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (phase !== "wizard" || e.key !== "Enter" || saving || step === TOUR_STEP || !canContinue) return;
      if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
      handleContinue();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, step, canContinue, saving, data, tenantId]);

  const finishing = useRef(false);
  async function handleFinish() {
    if (finishing.current || !tenantId) return;
    finishing.current = true;
    try {
      await finishWelcome(tenantId);
    } catch {
      // Not fatal: they'd simply not be marked done; still let them in
    } finally {
      router.replace("/home");
    }
  }

  if (phase === "connecting") return <Splash message="Setting up your account…" />;
  if (phase === "error") {
    return (
      <Splash message={errorMsg}>
        <a href="/home" className="mt-5 inline-flex h-11 items-center px-5 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700">
          Go to my home page
        </a>
      </Splash>
    );
  }

  return (
    <div className="h-[100dvh] bg-cream-50 flex flex-col overflow-hidden">
      {step < TOUR_STEP && (
        <div className="w-full max-w-md mx-auto px-6 pt-[max(20px,env(safe-area-inset-top))] pb-3 shrink-0">
          <div className="flex items-center gap-3 mb-3">
            {step > 1 ? <BackLink onClick={() => { setError(""); setStep(s => Math.max(1, s - 1)); }} /> : <div className="w-11 shrink-0" />}
            <div className="flex-1"><ProgressBar step={step} total={TOTAL_STEPS} /></div>
          </div>
          <p className="text-[11px] font-semibold text-forest-600 uppercase tracking-wide">
            Let&apos;s set up your Rightsize account
          </p>
        </div>
      )}

      <div className="flex-1 overflow-hidden relative">
        <div
          className="flex h-full w-full transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${(step - 1) * 100}%)` }}
        >
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="w-full h-full shrink-0 overflow-y-auto px-6 pb-4">
              <div className="max-w-md mx-auto pt-2">
                {n === 1 && (
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-4">What&apos;s your name?</h2>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="firstName" className="block text-xs font-medium text-gray-500 mb-1.5">First name</label>
                        <input id="firstName" type="text" value={data.firstName} onChange={e => update({ firstName: e.target.value })} placeholder="Jane"
                          className="w-full h-12 px-4 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white" />
                      </div>
                      <div>
                        <label htmlFor="lastName" className="block text-xs font-medium text-gray-500 mb-1.5">Last name</label>
                        <input id="lastName" type="text" value={data.lastName} onChange={e => update({ lastName: e.target.value })} placeholder="Smith"
                          className="w-full h-12 px-4 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white" />
                      </div>
                    </div>
                  </div>
                )}
                {n === 2 && <Step3Timeline data={data} update={update} />}
                {n === 3 && <Step4Destination data={data} update={update} />}
                {n === 4 && step === TOUR_STEP && (
                  <OnboardingTour
                    firstName={data.firstName}
                    summary=""
                    slides={tourSlides}
                    onFinish={handleFinish}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {step < TOUR_STEP && (
        <div className="w-full max-w-md mx-auto px-6 shrink-0">
          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
          <BottomCTA onClick={handleContinue} disabled={!canContinue} loading={saving} />
        </div>
      )}
    </div>
  );
}
