import { Suspense } from "react";
import { ContinueClient } from "./ContinueClient";

export const metadata = { title: "Setting up your account" };

export default function ContinuePage() {
  return (
    <Suspense fallback={<div className="h-[100dvh] bg-cream-50" />}>
      <ContinueClient />
    </Suspense>
  );
}
