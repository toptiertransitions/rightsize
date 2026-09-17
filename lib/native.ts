"use client";

import { Capacitor } from "@capacitor/core";

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getPlatform(): "ios" | "android" | "web" {
  try {
    return Capacitor.getPlatform() as "ios" | "android" | "web";
  } catch {
    return "web";
  }
}

/**
 * Opens a URL — in a new browser tab on web (unchanged, existing behavior),
 * or in a native in-app browser sheet on iOS/Android. Use this instead of
 * `window.open()` for anything reached inside the native app: a plain
 * WKWebView/Android WebView has no "tabs" to open into, so window.open()
 * either silently does nothing or misbehaves there. The in-app browser
 * sheet (Safari View Controller / Chrome Custom Tabs) is a separate native
 * view — outside the app's own WebView entirely, so it isn't subject to
 * capacitor.config.ts's allowNavigation whitelist — and correctly offers
 * the system's own view/download/share actions for whatever it loads.
 */
export async function openInBrowser(url: string): Promise<void> {
  if (isNativeApp()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Native side of handling a client-only Blob (a generated PDF or CSV, for
 * example): a blob: URL is scoped to the WebView's own JS context and can't
 * be handed to openInBrowser()/Browser.open() (a separate native process
 * has no access to it, and Safari View Controller only accepts http/https
 * URLs anyway) — so this writes the file to the app's cache directory and
 * hands it to the native Share sheet, which lets the user save it to
 * Files, print it, or share it directly. Shared by the two functions below
 * — their web branches differ (view vs. force-download), but native
 * behaves the same either way since the Share sheet covers both.
 */
async function shareBlobNative(blob: Blob, fileName: string): Promise<void> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");
  const base64Data = await blobToBase64(blob);
  const written = await Filesystem.writeFile({
    path: fileName,
    data: base64Data,
    directory: Directory.Cache,
  });
  await Share.share({ url: written.uri });
}

/**
 * For a client-only Blob previously opened for *viewing* via
 * `window.open(blobUrl, "_blank")` — unchanged on web. Native routes
 * through the Share sheet instead (see shareBlobNative above).
 */
export async function viewOrShareBlob(blob: Blob, fileName: string): Promise<void> {
  if (isNativeApp()) {
    await shareBlobNative(blob, fileName);
  } else {
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  }
}

/**
 * For a client-only Blob previously force-downloaded via a programmatic
 * `<a download>` click (the technique that preserves an exact filename on
 * save) — unchanged on web, same technique. Native routes through the
 * Share sheet instead (see shareBlobNative above).
 */
export async function downloadOrShareBlob(blob: Blob, fileName: string): Promise<void> {
  if (isNativeApp()) {
    await shareBlobNative(blob, fileName);
  } else {
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  }
}

/** Reads a Blob as base64 (no data: URI prefix) — what Filesystem.writeFile expects. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
