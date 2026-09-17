"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isNativeApp } from "@/lib/native";

// Mounted once, native-only, near the root of the authenticated app. Requests
// notification permission, registers this device's APNs token with our
// backend, and routes a tapped notification into whatever page it points at.
// Renders nothing — this is pure side effect, so there's no hydration
// mismatch to guard against the way NativeFileLink has to (no visible output
// differs between server and client renders here).
export function PushNotificationBootstrap() {
  const router = useRouter();

  useEffect(() => {
    if (!isNativeApp()) return;

    let cleanup: (() => void) | undefined;

    (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");

      const perm = await PushNotifications.checkPermissions();
      let status = perm.receive;
      if (status === "prompt" || status === "prompt-with-rationale") {
        status = (await PushNotifications.requestPermissions()).receive;
      }
      if (status !== "granted") return;

      await PushNotifications.register();

      const regListener = await PushNotifications.addListener("registration", (token) => {
        fetch("/api/push/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: token.value, platform: "iOS" }),
        }).catch((e) => console.error("[push] register failed:", e));
      });

      const errListener = await PushNotifications.addListener("registrationError", (err) => {
        console.error("[push] registration error:", err);
      });

      // Tapping a notification (app backgrounded or killed) — route into
      // whatever page the payload names, defaulting to the Inbox.
      const tapListener = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const url = (action.notification.data as { url?: string } | undefined)?.url;
        router.push(url || "/inbox");
      });

      cleanup = () => {
        regListener.remove();
        errListener.remove();
        tapListener.remove();
      };
    })();

    return () => cleanup?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
