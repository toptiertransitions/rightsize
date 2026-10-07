"use client";

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/native";
import { IOS_APP_STORE_URL } from "@/lib/ios-app";

// Shown on iPhone/iPad browsers only — never inside the app itself. Someone
// who reaches this page in a browser on iOS either doesn't have the app yet
// or opened the link from a mail client that bypasses Universal Links.
export function GetIosAppPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isNativeApp()) return;
    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    setShow(isIos);
  }, []);

  if (!show) return null;

  return (
    <div className="mt-6 pt-6 border-t border-cream-200 text-center">
      <p className="text-sm text-gray-600 mb-3">
        On iPhone? Get the Rightsize app, then tap the link in your email again to finish setup in the app.
      </p>
      <a
        href={IOS_APP_STORE_URL}
        className="inline-flex items-center justify-center h-10 px-4 bg-gray-900 text-white rounded-xl font-medium text-sm hover:bg-black transition-colors"
      >
        Download on the App Store
      </a>
    </div>
  );
}
