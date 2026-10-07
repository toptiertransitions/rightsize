"use client";

import { useState, useEffect } from "react";
import { isNativeApp, openInBrowser, downloadOrShareBlob } from "@/lib/native";

interface NativeFileLinkProps {
  href: string;
  download?: string;
  children: React.ReactNode;
  className?: string;
  target?: string;
  rel?: string;
  title?: string;
  onClick?: () => void;
  /** For files served by our own API behind the login (invoice/contract
   * PDFs). The in-app browser sheet has no Rightsize session, so it lands on
   * a sign-in page; instead fetch inside the app (session cookies included)
   * and hand the file to the native Share sheet (Save to Files, Print…).
   * Pass the file name via `download`. Web behavior is unchanged. */
  authenticated?: boolean;
}

/**
 * Drop-in replacement for `<a href download>` file/photo links — renders
 * as a normal anchor on web, byte-for-byte identical to what was there
 * before (same tag, same props, same attributes), so web behavior is
 * completely unchanged. Inside the native app, a plain `<a download>`
 * either silently does nothing or navigates the whole WebView away with
 * no way back (no "Downloads" folder concept in a WKWebView), so this
 * renders a button that routes through openInBrowser() instead — the
 * native in-app browser sheet correctly offers the system's own
 * view/download/share actions for the file.
 *
 * Defaults to the web (anchor) rendering on first paint to exactly match
 * server-rendered HTML, then switches to the native button variant after
 * mount if actually running in the app — avoids a hydration mismatch.
 */
export function NativeFileLink({ href, download, children, className, target, rel, title, onClick, authenticated }: NativeFileLinkProps) {
  const [native, setNative] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNative(isNativeApp()); }, []);

  if (!native) {
    return (
      <a href={href} download={download} target={target} rel={rel} className={className} title={title} onClick={onClick}>
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={className}
      title={title}
      disabled={busy}
      onClick={async () => {
        onClick?.();
        if (!authenticated) {
          await openInBrowser(href);
          return;
        }
        setBusy(true);
        try {
          const res = await fetch(href, { credentials: "include" });
          if (!res.ok) throw new Error(String(res.status));
          const fromHeader = res.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/)?.[1];
          await downloadOrShareBlob(await res.blob(), download || fromHeader || "document.pdf");
        } catch {
          alert("Couldn't download this file. Please try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
    </button>
  );
}
