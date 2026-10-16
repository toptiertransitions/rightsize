"use client";

import { useEffect, useState } from "react";

export function Avatar({ name, photoUrl, size = 36, className = "" }: { name: string; photoUrl?: string; size?: number; className?: string }) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt="" className={`rounded-full object-cover flex-shrink-0 ${className}`} style={{ width: size, height: size }} />
    );
  }
  const initials = name.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div
      aria-hidden="true"
      className={`rounded-full bg-forest-100 text-forest-700 flex items-center justify-center font-semibold flex-shrink-0 select-none ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
    >
      {initials || "?"}
    </div>
  );
}

export function ProjectGlyph({ size = 36 }: { size?: number }) {
  return (
    <div className="rounded-xl bg-forest-50 text-forest-700 flex items-center justify-center flex-shrink-0 font-bold" style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }} aria-hidden="true">
      #
    </div>
  );
}

export function AnnouncementGlyph({ size = 36 }: { size?: number }) {
  return (
    <div className="rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <svg className="w-1/2 h-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    </div>
  );
}

const CT = "America/Chicago";

export function ctDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: CT });
}

/** "4:12 PM" */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: CT, hour: "numeric", minute: "2-digit" });
}

/** "Today", "Yesterday", "Monday, Oct 13", "Oct 13, 2025" */
export function formatDayLabel(iso: string): string {
  const key = ctDateKey(iso);
  const today = ctDateKey(new Date().toISOString());
  const yesterday = ctDateKey(new Date(Date.now() - 86400000).toISOString());
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  const d = new Date(iso);
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  const ageDays = (Date.now() - d.getTime()) / 86400000;
  return d.toLocaleDateString("en-US", {
    timeZone: CT,
    ...(ageDays < 7 ? { weekday: "long" as const } : {}),
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" as const }),
  });
}

/** Compact list timestamp: "4:12 PM" today, "Yesterday", "Mon", "Oct 13" */
export function formatListTime(iso: string | null): string {
  if (!iso) return "";
  const key = ctDateKey(iso);
  if (key === ctDateKey(new Date().toISOString())) return formatTime(iso);
  if (key === ctDateKey(new Date(Date.now() - 86400000).toISOString())) return "Yesterday";
  const ageDays = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (ageDays < 7) return new Date(iso).toLocaleDateString("en-US", { timeZone: CT, weekday: "short" });
  return new Date(iso).toLocaleDateString("en-US", { timeZone: CT, month: "short", day: "numeric" });
}

/** "Thu, Oct 16" for a YYYY-MM-DD shift date */
export function formatShiftDate(ymd: string): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: CT });
  if (ymd === today) return "Today";
  return new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * The visible area above the on-screen keyboard. iOS WebViews overlay the
 * keyboard instead of resizing the page, so a full-screen conversation
 * sizes itself to this to keep the composer just above the keyboard.
 */
export function useVisualViewport(active: boolean): { height: number; top: number; keyboardOpen: boolean } | null {
  const [box, setBox] = useState<{ height: number; top: number; keyboardOpen: boolean } | null>(null);
  useEffect(() => {
    if (!active || typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => setBox({ height: vv.height, top: vv.offsetTop, keyboardOpen: window.innerHeight - vv.height > 120 });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);
  return active ? box : null;
}

/** Below Tailwind's lg breakpoint: conversations open full screen. */
export function useIsCompact(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setCompact(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return compact;
}

export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-forest-600 text-white text-[11px] font-bold flex items-center justify-center leading-none" aria-label={`${count} unread`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function BackIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

export function CloseIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
