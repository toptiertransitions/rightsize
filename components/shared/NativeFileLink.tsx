"use client";

import { useState, useEffect } from "react";
import { isNativeApp, openInBrowser } from "@/lib/native";

interface NativeFileLinkProps {
  href: string;
  download?: string;
  children: React.ReactNode;
  className?: string;
  target?: string;
  rel?: string;
  title?: string;
  onClick?: () => void;
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
export function NativeFileLink({ href, download, children, className, target, rel, title, onClick }: NativeFileLinkProps) {
  const [native, setNative] = useState(false);
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
      onClick={async () => {
        onClick?.();
        await openInBrowser(href);
      }}
    >
      {children}
    </button>
  );
}
