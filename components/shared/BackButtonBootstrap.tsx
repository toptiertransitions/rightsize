"use client";

import { useEffect } from "react";
import { getPlatform } from "@/lib/native";
import { closeTopmostPopup } from "@/lib/back-button";

// Android only (iPhone has no back button; the web has the browser's own).
// Back closes an open popup or menu first, then goes back a page, and at the
// app's first page sends the app to the background instead of quitting.
export function BackButtonBootstrap() {
  useEffect(() => {
    if (getPlatform() !== "android") return;
    let remove: (() => void) | undefined;
    (async () => {
      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("backButton", ({ canGoBack }) => {
        if (closeTopmostPopup()) return;
        // Clerk's account menu and other Escape-aware menus
        if (document.querySelector(".cl-userButtonPopoverCard")) {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          (document.activeElement as HTMLElement | null)?.blur?.();
          return;
        }
        if (canGoBack) window.history.back();
        else App.minimizeApp();
      });
      remove = () => handle.remove();
    })().catch(() => {});
    return () => remove?.();
  }, []);
  return null;
}
