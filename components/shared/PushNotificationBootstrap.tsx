"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { isNativeApp } from "@/lib/native";

const DEVICE_TOKEN_STORAGE_KEY = "rz_push_device_token";

interface ForegroundNotification {
  title: string;
  body: string;
  url?: string;
}

// Mounted once, native-only, near the root of the authenticated app. Requests
// notification permission, registers this device's APNs token with our
// backend, routes a tapped notification into whatever page it points at, and
// shows an in-app banner for a notification that arrives while the app is
// already open (push notifications don't show their own system banner for a
// foregrounded app). Renders nothing in the common case — only the banner
// state produces visible output.
export function PushNotificationBootstrap() {
  const router = useRouter();
  const { user } = useUser();
  const [banner, setBanner] = useState<ForegroundNotification | null>(null);

  // Respect the opt-out toggle (components/shared/NotificationSettings
  // writes this on the user's own unsafeMetadata) — checked before ever
  // requesting permission or registering a device.
  const pushOptedOut = user?.unsafeMetadata?.pushOptOut === true;

  useEffect(() => {
    if (!isNativeApp() || pushOptedOut) return;

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
        try { localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, token.value); } catch {}
        fetch("/api/push/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: token.value, platform: "iOS", environment: "production" }),
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

      // App is open and in the foreground when a push arrives — no system
      // banner shows for this case on iOS, so show our own.
      const receivedListener = await PushNotifications.addListener("pushNotificationReceived", (notification) => {
        const data = notification.data as { url?: string } | undefined;
        setBanner({
          title: notification.title || "Notification",
          body: notification.body || "",
          url: data?.url,
        });
      });

      cleanup = () => {
        regListener.remove();
        errListener.remove();
        tapListener.remove();
        receivedListener.remove();
      };
    })();

    return () => cleanup?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushOptedOut]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(t);
  }, [banner]);

  if (!banner) return null;

  return (
    <button
      onClick={() => {
        const url = banner.url;
        setBanner(null);
        router.push(url || "/inbox");
      }}
      className="fixed inset-x-3 z-[100] text-left bg-gray-900 text-white rounded-2xl shadow-xl px-4 py-3 active:scale-[0.98] transition-transform"
      style={{ top: "max(12px, env(safe-area-inset-top))" }}
    >
      <p className="text-sm font-semibold leading-snug">{banner.title}</p>
      {banner.body && <p className="text-xs text-gray-300 mt-0.5 leading-snug truncate">{banner.body}</p>}
    </button>
  );
}

/** Reads the locally-cached device token, if any — used by the sign-out flow to unregister it before the Clerk session actually ends. */
export function getCachedDeviceToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}
