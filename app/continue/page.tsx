import { Suspense } from "react";
import { ContinueClient } from "./ContinueClient";
import { AccountSplash } from "@/components/auth/AccountSplash";

export const metadata = { title: "Setting up your account" };

export default function ContinuePage() {
  return (
    <Suspense fallback={<AccountSplash />}>
      <ContinueClient />
    </Suspense>
  );
}
