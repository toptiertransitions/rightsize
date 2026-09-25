"use client";

import type { WizardData } from "../wizardTypes";
import { OnboardingTour } from "./OnboardingTour";

function summaryLine(data: WizardData): string {
  if (data.appOnlyIntent) {
    return "your project, catalog, and room-by-room plan.";
  }
  const count = data.serviceInterests.length;
  if (count === 0) return "your project and a personalized dashboard.";
  if (count === 1) return "your project, plus matches for the help you picked.";
  return "your project, plus matches across everything you picked.";
}

// The tour (OnboardingTour) IS the completion screen now — a celebration
// slide followed by four quick app-overview slides, all one click-through
// sequence. Earlier this was a separate "You're all set" screen with
// "Take a tour" / "Skip, go to my dashboard" as two equal-weight buttons,
// which let people skip the tour without ever really seeing it.
export function Step7Done({ data, firstName, onFinish }: { data: WizardData; firstName: string; onFinish: () => void }) {
  return <OnboardingTour firstName={firstName} summary={summaryLine(data)} onFinish={onFinish} />;
}
