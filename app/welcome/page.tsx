import { Suspense } from "react";
import type { Metadata } from "next";
import { WelcomeClient } from "./WelcomeClient";

export const metadata: Metadata = { title: "Welcome | Rightsize by Top Tier", robots: "noindex, nofollow" };

export default function WelcomePage() {
  return (
    <Suspense fallback={<div className="h-[100dvh] bg-cream-50" />}>
      <WelcomeClient />
    </Suspense>
  );
}
