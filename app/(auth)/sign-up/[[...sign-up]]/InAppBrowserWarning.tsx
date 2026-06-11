"use client";

import { useEffect, useState } from "react";

function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /FBAN|FBAV|FB_IAB/i.test(ua) ||       // Facebook
    /Instagram/i.test(ua) ||               // Instagram
    /LinkedIn/i.test(ua) ||                // LinkedIn
    /Twitter|TweetDeck/i.test(ua) ||       // Twitter/X
    /\bOPR\b.*Mobile|OPiOS/i.test(ua) ||  // Opera mini
    /GSA\//i.test(ua) ||                   // Gmail app (iOS)
    /\bMSOutlook\b|Outlook-iOS/i.test(ua) || // Outlook
    // Generic WebView detection on iOS/Android
    (/iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua) && /AppleWebKit/.test(ua)) ||
    (/Android/.test(ua) && /wv\)/.test(ua))
  );
}

export default function InAppBrowserWarning() {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (isInAppBrowser()) {
      setShow(true);
      setUrl(window.location.href);
    }
  }, []);

  if (!show) return null;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback: select the text input
      const el = document.getElementById("iab-url-input") as HTMLInputElement | null;
      el?.select();
    }
  }

  return (
    <div className="w-full max-w-md mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-800 mb-1">Open in Safari or Chrome</p>
          <p className="text-xs text-amber-700 mb-3 leading-relaxed">
            This page was opened inside an app&rsquo;s built-in browser, which isn&rsquo;t supported for account creation. Copy the link below and paste it into <strong>Safari</strong> or <strong>Chrome</strong>.
          </p>
          <div className="flex gap-2">
            <input
              id="iab-url-input"
              readOnly
              value={url}
              className="flex-1 min-w-0 text-xs px-2 py-1.5 rounded-lg border border-amber-200 bg-white text-gray-600 truncate"
            />
            <button
              onClick={copyUrl}
              className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
