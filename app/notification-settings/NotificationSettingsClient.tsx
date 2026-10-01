"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { isNativeApp } from "@/lib/native";

export function NotificationSettingsClient() {
  const { user, isLoaded } = useUser();
  const [native, setNative] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setNative(isNativeApp()); }, []);

  const optedOut = user?.unsafeMetadata?.pushOptOut === true;

  async function setOptOut(value: boolean) {
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      await user.update({ unsafeMetadata: { ...user.unsafeMetadata, pushOptOut: value } });

      // Turning it back on: if we've never been granted permission, ask
      // right away rather than waiting for the next app launch.
      if (!value && native) {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const perm = await PushNotifications.checkPermissions();
        if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
          const result = await PushNotifications.requestPermissions();
          if (result.receive === "granted") await PushNotifications.register();
        }
      }
    } catch {
      setError("Couldn't save that change. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-cream-50"
      style={{ paddingTop: "max(20px, env(safe-area-inset-top))", paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
    >
      <div className="max-w-md mx-auto px-4 sm:px-6">
        <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-forest-700 mb-4">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Rightsize
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Notifications</h1>
        <p className="text-sm text-gray-500 mb-6">Shift invites, reminders, and messages</p>

        {!native ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-600">Push notifications are only available in the Rightsize iOS app.</p>
          </div>
        ) : !isLoaded ? (
          <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">Push notifications</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {optedOut ? "Off — you won't get shift invites, reminders, or message alerts on this device." : "On for this account."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOptOut(!optedOut)}
                disabled={saving}
                aria-pressed={!optedOut}
                className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                  !optedOut ? "bg-forest-500" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-150 ${
                    !optedOut ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
            <p className="text-xs text-gray-400 mt-4 leading-relaxed">
              If you previously declined the system permission prompt, turning this on here won&rsquo;t be enough — iOS only asks once.
              You&rsquo;ll also need to enable it in your iPhone&rsquo;s Settings app under Rightsize → Notifications.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
