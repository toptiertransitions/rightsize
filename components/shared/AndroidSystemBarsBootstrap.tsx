"use client";

import { useEffect } from "react";
import { getPlatform } from "@/lib/native";

// Android only: white status/gesture bar icons, to sit on the brand-green
// window color set in android/app/src/main/res/values/styles.xml. iOS keeps
// its own StatusBar settings; the web is untouched.
export function AndroidSystemBarsBootstrap() {
  useEffect(() => {
    if (getPlatform() !== "android") return;
    import("@capacitor/core")
      .then(({ SystemBars, SystemBarsStyle }) => SystemBars.setStyle({ style: SystemBarsStyle.Dark }))
      .catch(() => {});
  }, []);
  return null;
}
