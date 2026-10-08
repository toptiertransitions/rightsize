"use client";

import { Suspense, useEffect, useState } from "react";
import { SignUp, useAuth, useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AccountSplash } from "@/components/auth/AccountSplash";
import InAppBrowserWarning from "./InAppBrowserWarning";
import { isNativeApp } from "@/lib/native";

function SignUpContent() {
  // Google OAuth doesn't work inside the Capacitor app's embedded webview
  // (Google blocks sign-in from non-standard browser webviews) — same fix
  // already applied on the sign-in page. Email code / password still works.
  const hideSocialButtons = isNativeApp();

  // Clerk's legacy NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL env var behaves as an
  // unconditional redirect that silently ignores any ?redirect_url= on the
  // page — this is why a brand-new client signing up from an invite link
  // was landing on /onboarding (create-your-own-project) instead of back at
  // /invite to accept the project they were actually invited to. The fix is
  // to always resolve it ourselves and pass it explicitly, since an
  // explicit prop always wins over the env var.
  const searchParams = useSearchParams();
  // Routed through /continue, which waits for the new session before
  // opening the (protected) destination, so nobody flashes through /sign-in.
  const destination = searchParams.get("redirect_url") || "/get-started";
  const redirectUrl = `/continue?to=${encodeURIComponent(destination)}`;
  // Partner invites carry the invited address so it's already filled in
  // (it's how the new account gets linked to the invitation).
  const invitedEmail = searchParams.get("email") ?? undefined;

  // The moment the account exists, cover Clerk's card with the setup
  // screen. Right after the email code is accepted, Clerk briefly routes
  // back to /sign-up and re-renders the "Create your account" form before
  // its redirect fires; that's the login-page flash people saw. Keyed on
  // the new session existing (not just "signed in", which comes a beat
  // later) and kept up until we leave this page. Finishes the hop
  // ourselves if Clerk's own redirect is slow.
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  const router = useRouter();
  const [signUpComplete, setSignUpComplete] = useState(false);
  useEffect(() => {
    // Clerk records the new session on the client (lastActiveSessionId)
    // the instant the code is accepted, ~1.5s before it counts as signed in
    // and before the form re-renders, so key on that.
    return clerk.addListener(({ client, session }) => {
      if (session || client?.lastActiveSessionId || client?.signUp?.status === "complete") setSignUpComplete(true);
    });
  }, [clerk]);
  const showSplash = signUpComplete || (isLoaded && !!isSignedIn);
  useEffect(() => {
    if (!showSplash) return;
    const t = setTimeout(() => router.replace(redirectUrl), 2000);
    return () => clearTimeout(t);
  }, [showSplash, router, redirectUrl]);

  return (
    <div className="min-h-screen bg-cream-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <Link href="/" className="inline-flex items-center gap-2.5 mb-2">
          <div className="w-10 h-10 bg-forest-600 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <div className="text-left">
            <div className="font-bold text-forest-700 leading-none">Rightsize</div>
            <div className="text-[11px] text-gray-400">by Top Tier</div>
          </div>
        </Link>
        <p className="text-sm text-gray-500">Free account · No credit card needed</p>
      </div>
      {showSplash && <AccountSplash overlay />}
      <InAppBrowserWarning />
      <SignUp
        fallbackRedirectUrl={redirectUrl}
        initialValues={invitedEmail ? { emailAddress: invitedEmail } : undefined}
        appearance={{
          elements: {
            rootBox: "w-full max-w-md",
            card: "shadow-md rounded-2xl border border-cream-200",
            headerTitle: "text-gray-900 font-bold",
            primaryButton:
              "bg-forest-600 hover:bg-forest-700 text-white rounded-xl h-12",
            socialButtonsBlockButton:
              "border border-gray-300 rounded-xl h-12 hover:bg-gray-50",
            formFieldInput: "rounded-xl h-12 border-gray-300",
            socialButtons: hideSocialButtons ? "hidden" : undefined,
            dividerRow: hideSocialButtons ? "hidden" : undefined,
          },
        }}
      />
      <p className="text-xs text-gray-400 mt-6 text-center max-w-md">
        By creating an account, you agree to our{" "}
        <Link href="/privacy" className="underline hover:text-gray-600">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream-50" />}>
      <SignUpContent />
    </Suspense>
  );
}
