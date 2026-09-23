"use client";

import { PartyPopper } from "lucide-react";
import type { WizardData } from "../wizardTypes";

function summaryLine(data: WizardData): string {
  if (data.appOnlyIntent) {
    return "your project, catalog, and room-by-room plan.";
  }
  const count = data.serviceInterests.length;
  if (count === 0) return "your project and a personalized dashboard.";
  if (count === 1) return "your project, plus matches for the help you picked.";
  return "your project, plus matches across everything you picked.";
}

export function Step7Done({ data, firstName, onFinish }: { data: WizardData; firstName: string; onFinish: () => void }) {
  return (
    <div className="flex flex-col items-center text-center pt-6">
      <div className="w-16 h-16 rounded-2xl bg-forest-50 flex items-center justify-center mb-5">
        <PartyPopper className="w-8 h-8 text-forest-600" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">You&apos;re all set, {firstName || "there"}.</h2>
      <p className="text-sm text-gray-500 max-w-xs mb-8">
        We&apos;ve set up {summaryLine(data)}
      </p>
      <button
        type="button"
        onClick={onFinish}
        className="w-full max-w-xs min-h-[48px] h-12 rounded-2xl bg-forest-600 text-white font-semibold text-[15px] shadow-sm hover:bg-forest-700 active:scale-[0.99] transition-all"
      >
        Go to my dashboard
      </button>
    </div>
  );
}
