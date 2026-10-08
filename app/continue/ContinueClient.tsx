"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { AccountSplash } from "@/components/auth/AccountSplash";

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
      // Only open the destination once the server sees the session too;
      // otherwise a protected page bounces through /sign-in for a moment.
      for (let i = 0; i < 25; i++) {
        try {
          const r = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
          if (r.ok && (await r.json()).signedIn) break;
        } catch { /* retry */ }
        await new Promise((res) => setTimeout(res, 200));
      }
      // API destinations (e.g. partner activation) need a real page load
      if (to.startsWith("/api/")) window.location.replace(to);
      else router.replace(to);
    })();
  }, [isLoaded, isSignedIn, getToken, router, to]);

  return <AccountSplash />;
}
