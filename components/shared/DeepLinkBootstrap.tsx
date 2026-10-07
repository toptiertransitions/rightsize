"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/native";

const LAUNCH_URL_KEY = "rz_handled_launch_url";

// Mounted once at the root, native-only. When iOS opens the app from a
// Universal Link (e.g. "Access Your Project" in the client invite email),
// Capacitor reports the URL through the App plugin but does not navigate the
// WebView itself — so load the same path here. Covers both a cold launch
// (getLaunchUrl) and an app that was already running (appUrlOpen).
export function DeepLinkBootstrap() {
  useEffect(() => {
    if (!isNativeApp()) return;
    let removeListener: (() => void) | undefined;

    const open = (rawUrl: string) => {
      try {
        const url = new URL(rawUrl);
        if (url.host !== window.location.host) return;
        const target = url.pathname + url.search + url.hash;
        if (target !== window.location.pathname + window.location.search + window.location.hash) {
          window.location.assign(target);
        }
      } catch {
        // Malformed URL — ignore
      }
    };

    (async () => {
      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("appUrlOpen", ({ url }) => open(url));
      removeListener = () => handle.remove();
      // getLaunchUrl keeps returning the same URL for the life of the
      // process, and this component remounts on every full page load (e.g.
      // Clerk's sign-up redirects) — only act on it once, or the user would
      // be bounced back to the invite page mid-signup.
      const launch = await App.getLaunchUrl();
      if (launch?.url) {
        let handled = false;
        try {
          handled = sessionStorage.getItem(LAUNCH_URL_KEY) === launch.url;
          sessionStorage.setItem(LAUNCH_URL_KEY, launch.url);
        } catch {
          // Storage unavailable — fall through and open once
        }
        if (!handled) open(launch.url);
      }
    })();

    return () => removeListener?.();
  }, []);

  return null;
}
