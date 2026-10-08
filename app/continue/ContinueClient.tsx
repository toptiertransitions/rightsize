"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

// Landing spot right after sign-up. Sending a brand-new account straight to
// a protected page can beat the new session to the server, which bounces
// them through /sign-in for a split second. This page is public, waits on
// the client until the session is live (and its cookie written), then goes
// on to the real destination behind one steady screen.

// Same-site paths only. Clerk often hands back a full URL (e.g. an invite
// link), so a same-origin absolute URL is reduced to its path.
function safeDestination(to: string | null): string {
  if (!to) return "/get-started";
  if (to.startsWith("/") && !to.startsWith("//")) return to;
  try {
    const u = new URL(to);
    if (typeof window !== "undefined" && u.origin === window.location.origin) return `${u.pathname}${u.search}${u.hash}`;
  } catch { /* fall through */ }
  return "/get-started";
}

export function ContinueClient() {
  const router = useRouter();
  const params = useSearchParams();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const done = useRef(false);
  const to = safeDestination(params.get("to"));

  useEffect(() => {
    if (!isLoaded || done.current) return;

    if (!isSignedIn) {
      // A new session can lag a moment behind sign-up; only send them to
      // sign in if it really never shows up.
      const t = setTimeout(() => {
        if (!done.current) router.replace(`/sign-in?redirect_url=${encodeURIComponent(to)}`);
      }, 4000);
      return () => clearTimeout(t);
    }

    done.current = true;
    (async () => {
      try { await getToken(); } catch { /* go on regardless */ }
      // API destinations (e.g. partner activation) need a real page load
      if (to.startsWith("/api/")) window.location.replace(to);
      else router.replace(to);
    })();
  }, [isLoaded, isSignedIn, getToken, router, to]);

  return (
    <div className="h-[100dvh] bg-cream-50 flex flex-col items-center justify-center px-6 text-center">
      <div className="w-12 h-12 rounded-2xl bg-forest-600 flex items-center justify-center mb-5">
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </div>
      <svg className="animate-spin h-5 w-5 text-forest-500 mb-3" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <p className="text-base font-medium text-gray-700">Setting up your account…</p>
    </div>
  );
}
