"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isNativeApp } from "@/lib/native";
import { IOS_APP_STORE_URL } from "@/lib/ios-app";

// The invite page's buttons. In an iPhone/iPad browser (not the app), the
// Rightsize app download is the main action, since someone reaching this
// page in a browser on iOS most likely doesn't have the app yet; signing up
// in the browser stays available underneath. Everywhere else (desktop, and
// inside the app) it's the plain sign-up. iOS is detected after mount, so
// the server renders the plain layout for non-iOS user agents and holds the
// buttons back for iOS ones until the check runs (no flash in the app).
export function PartnerInviteActions({
  signUpHref,
  signInHref,
  email,
  likelyIos,
}: {
  signUpHref: string;
  signInHref: string;
  email?: string;
  likelyIos: boolean;
}) {
  const [mode, setMode] = useState<"pending" | "app-first" | "plain">(likelyIos ? "pending" : "plain");

  useEffect(() => {
    if (isNativeApp()) return setMode("plain");
    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    setMode(isIos ? "app-first" : "plain");
  }, []);

  const emailNote = email ? (
    <p className="text-center text-xs text-gray-400">
      Use <span className="font-medium text-gray-600">{email}</span> so we can connect your account to this invitation.
    </p>
  ) : null;

  if (mode === "pending") return <div className="h-40" aria-hidden="true" />;

  if (mode === "app-first") {
    return (
      <div className="space-y-4">
        <ol className="space-y-2 text-sm text-gray-600">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-forest-50 text-forest-700 text-xs font-bold flex items-center justify-center">1</span>
            <span>Download the free Rightsize app.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-forest-50 text-forest-700 text-xs font-bold flex items-center justify-center">2</span>
            <span>Go back to your invitation email and tap <strong>Get Started</strong> again. It opens right in the app.</span>
          </li>
        </ol>
        <a
          href={IOS_APP_STORE_URL}
          className="flex items-center justify-center w-full h-12 px-5 bg-gray-900 text-white rounded-xl font-semibold text-base hover:bg-black transition-colors"
        >
          Get the Rightsize app
        </a>
        <p className="text-center text-sm text-gray-400">
          Or{" "}
          <Link href={signUpHref} className="text-forest-700 font-medium hover:underline">
            continue in your browser
          </Link>
          {" "}&middot;{" "}
          <Link href={signInHref} className="text-forest-700 font-medium hover:underline">
            Sign in
          </Link>
        </p>
        {emailNote}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Link
        href={signUpHref}
        className="flex items-center justify-center w-full h-12 px-5 bg-forest-600 text-white rounded-xl font-semibold text-base hover:bg-forest-700 transition-colors"
      >
        Create your account
      </Link>
      <p className="text-center text-sm text-gray-400">
        Already have a Rightsize account?{" "}
        <Link href={signInHref} className="text-forest-700 font-medium hover:underline">
          Sign in
        </Link>
      </p>
      {emailNote}
    </div>
  );
}
