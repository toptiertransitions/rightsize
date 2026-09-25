"use client";

import { useState } from "react";
import { Home, Camera, CalendarDays, Handshake } from "lucide-react";

interface Slide {
  icon: React.ReactNode;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: <Home className="w-9 h-9" />,
    title: "Your Home Base",
    body: "This is where you'll always start. See what's next, track your progress, and get to any part of your move from one simple place.",
  },
  {
    icon: <Camera className="w-9 h-9" />,
    title: "Catalog Your Items",
    body: "Take a photo of anything in your home. We identify it, estimate what it's worth, and suggest whether to sell, donate, or keep it — no typing needed.",
  },
  {
    icon: <CalendarDays className="w-9 h-9" />,
    title: "Your Move, Day by Day",
    body: "See your whole timeline at a glance — packing days, moving day, and every key date in between, all in one easy calendar.",
  },
  {
    icon: <Handshake className="w-9 h-9" />,
    title: "Trusted Help, Matched for You",
    body: "We've matched you with vetted movers, realtors, and more near you. Look them over, and request an introduction whenever you're ready.",
  },
];

// A short, click-through (not auto-advancing) tour of the app's four main
// screens, shown once right after signup — large text and plain language
// by design, since this flow serves self-service senior clients as much as
// anyone. "Skip tour" always stays reachable; nothing here is mandatory.
export function OnboardingTour({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(0);
  const isLast = step === SLIDES.length - 1;

  return (
    <div className="flex flex-col">
      <div className="flex justify-end px-1 pb-2">
        <button
          type="button"
          onClick={onFinish}
          className="text-sm font-medium text-gray-400 hover:text-gray-600 min-h-[44px] px-2 flex items-center"
        >
          Skip tour
        </button>
      </div>

      <div className="overflow-hidden relative min-h-[340px]">
        <div
          className="flex w-full transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${step * 100}%)` }}
        >
          {SLIDES.map((s, i) => (
            <div key={i} className="w-full shrink-0 flex flex-col items-center text-center px-2">
              <div className="w-20 h-20 rounded-3xl bg-forest-50 text-forest-600 flex items-center justify-center mb-6 mt-2">
                {s.icon}
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3 [text-wrap:balance]">{s.title}</h2>
              <p className="text-lg text-gray-600 leading-relaxed max-w-sm">{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-6">
        <div className="flex items-center justify-center gap-2 mb-5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => setStep(i)}
              className={`h-2.5 rounded-full transition-all ${i === step ? "w-7 bg-forest-600" : "w-2.5 bg-gray-200 hover:bg-gray-300"}`}
            />
          ))}
        </div>

        <div className="flex gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="min-h-[52px] px-6 rounded-2xl border border-gray-200 text-gray-600 font-semibold text-[15px] hover:bg-gray-50 active:scale-[0.99] transition-all"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (isLast ? onFinish() : setStep((s) => s + 1))}
            className="flex-1 min-h-[52px] rounded-2xl bg-forest-600 text-white font-semibold text-[15px] shadow-sm hover:bg-forest-700 active:scale-[0.99] transition-all"
          >
            {isLast ? "Go to my dashboard" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
