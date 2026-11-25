"use client";

// Small building blocks for the Community tab: icons, toasts, confirm
// dialog, accordion, copy button, completeness bar and a focus trap.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { RuleIcon } from "@/lib/communities/types";

// ─── Icons (24px stroke icons, sized by className) ────────────────────────────

const PATHS: Record<string, string> = {
  search: "M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z",
  x: "M6 18L18 6M6 6l12 12",
  chevronDown: "M19 9l-7 7-7-7",
  chevronUp: "M5 15l7-7 7 7",
  arrowUp: "M12 19V5m-6 6l6-6 6 6",
  arrowDown: "M12 5v14m6-6l-6 6-6-6",
  phone: "M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.49a1 1 0 01-.5 1.21l-2.26 1.13a11.04 11.04 0 005.52 5.52l1.13-2.26a1 1 0 011.21-.5l4.49 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.72 21 3 14.28 3 6V5z",
  mail: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  copy: "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z",
  check: "M5 13l4 4L19 7",
  star: "M11.05 2.93c.3-.92 1.6-.92 1.9 0l1.52 4.67a1 1 0 00.95.69h4.91c.97 0 1.37 1.24.59 1.81l-3.97 2.89a1 1 0 00-.36 1.12l1.52 4.67c.3.92-.76 1.69-1.54 1.12l-3.98-2.89a1 1 0 00-1.17 0l-3.98 2.89c-.78.57-1.84-.2-1.54-1.12l1.52-4.67a1 1 0 00-.36-1.12L2.98 10.1c-.78-.57-.38-1.81.59-1.81h4.91a1 1 0 00.95-.69l1.52-4.67z",
  more: "M12 5h.01M12 12h.01M12 19h.01",
  download: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4",
  edit: "M15.23 5.23l3.54 3.54M4 20h4l10.5-10.5a2.5 2.5 0 00-3.54-3.54L4.5 16.46 4 20z",
  archive: "M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4",
  restore: "M4 4v5h.58m15.36 2A8 8 0 004.58 9m0 0H9m11 11v-5h-.58m0 0a8 8 0 01-15.36-2m15.36 2H15",
  pin: "M17.66 16.66L13.41 20.9a2 2 0 01-2.83 0l-4.24-4.24a8 8 0 1111.31 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z",
  plus: "M12 4v16m8-8H4",
  filter: "M3 4h18l-7 8v6l-4 2v-8L3 4z",
  columns: "M9 4H5a1 1 0 00-1 1v14a1 1 0 001 1h4m0-16v16m0-16h6m-6 16h6m0-16h4a1 1 0 011 1v14a1 1 0 01-1 1h-4m0-16v16",
  grip: "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01",
  link: "M13.83 10.17a4 4 0 00-5.66 0l-4 4a4 4 0 105.66 5.66l1.1-1.1m-.76-4.9a4 4 0 005.66 0l4-4a4 4 0 00-5.66-5.66l-1.1 1.1",
  alert: "M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
  history: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  sort: "M7 4v16m0 0l-3-3m3 3l3-3M17 20V4m0 0l-3 3m3-3l3 3",
  // Rule icons
  door: "M5 21V4a1 1 0 011-1h10a1 1 0 011 1v17M3 21h18M13 12h.01",
  truck: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm10 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
  elevator: "M5 3h14a1 1 0 011 1v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1zm4 7l3-3 3 3m-6 4l3 3 3-3",
  clock: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  calendar: "M8 7V3m8 4V3M5 11h14M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  shield: "M9 12l2 2 4-4m5.62-4.02A11.96 11.96 0 0112 2.94 11.96 11.96 0 013.38 5.98 12.02 12.02 0 0012 21.06a12.02 12.02 0 008.62-15.08z",
  file: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.59a1 1 0 01.7.29l5.42 5.42a1 1 0 01.29.7V19a2 2 0 01-2 2z",
  key: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.74 5.74L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.59a1 1 0 01.29-.7l5.97-5.97A6 6 0 1121 9z",
  trash: "M19 7l-.87 12.14A2 2 0 0116.14 21H7.86a2 2 0 01-2-1.86L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  info: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
};
export type IconName = keyof typeof PATHS | RuleIcon;

export function Icon({ name, className = "w-4 h-4", filled }: { name: IconName; className?: string; filled?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={name === "more" || name === "grip" ? 3 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

// ─── Toasts ───────────────────────────────────────────────────────────────────

export interface ToastMsg { id: number; text: string; tone: "ok" | "error"; action?: { label: string; run: () => void } }

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback((text: string, tone: ToastMsg["tone"] = "ok", action?: ToastMsg["action"]) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, text, tone, action }]);
    setTimeout(() => dismiss(id), action ? 8000 : 4500);
  }, [dismiss]);
  return { toasts, show, dismiss };
}

export function Toasts({ toasts, dismiss }: { toasts: ToastMsg[]; dismiss: (id: number) => void }) {
  return (
    <div aria-live="polite" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] flex flex-col gap-2 w-[min(92vw,420px)] pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className={cn(
          "pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lg",
          t.tone === "error" ? "bg-red-700 text-white" : "bg-gray-900 text-white"
        )}>
          <Icon name={t.tone === "error" ? "alert" : "check"} className="w-4 h-4 shrink-0" />
          <span className="flex-1">{t.text}</span>
          {t.action && (
            <button onClick={() => { t.action!.run(); dismiss(t.id); }} className="font-semibold underline underline-offset-2 min-h-[32px] px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded">
              {t.action.label}
            </button>
          )}
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="opacity-70 hover:opacity-100 p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Focus trap (drawer, dialogs, sheets) ────────────────────────────────────

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab inside `ref` while active, focuses the first control, and
 * returns focus to whatever had it before. */
export function useFocusTrap(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus({ preventScroll: true });
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Tab" || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const firstEl = items[0], lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, [active]);
  return ref;
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

export function ConfirmDialog({ open, title, body, confirmLabel, tone = "primary", onConfirm, onCancel }: {
  open: boolean; title: string; body: ReactNode; confirmLabel: string; tone?: "primary" | "danger"; onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useFocusTrap(open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="community-confirm-title" className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 id="community-confirm-title" className="text-lg font-semibold text-gray-900">{title}</h2>
        <div className="mt-2 text-sm text-gray-600 leading-relaxed">{body}</div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCancel} className="min-h-[44px] px-4 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-500">Cancel</button>
          <button data-autofocus onClick={onConfirm} className={cn(
            "min-h-[44px] px-4 rounded-xl text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            tone === "danger" ? "bg-red-600 hover:bg-red-700 focus-visible:ring-red-500" : "bg-forest-600 hover:bg-forest-700 focus-visible:ring-forest-500"
          )}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Accordion section ────────────────────────────────────────────────────────

export function Section({ id, title, open, onToggle, count, children }: {
  id: string; title: string; open: boolean; onToggle: () => void; count?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="border-t border-gray-100">
      <h3>
        <button
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          className="w-full flex items-center gap-2 py-3.5 text-left min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 rounded-lg"
        >
          <span className="text-[15px] font-semibold text-gray-900">{title}</span>
          {count !== undefined && <span className="text-xs text-gray-500">{count}</span>}
          <Icon name={open ? "chevronUp" : "chevronDown"} className="w-4 h-4 ml-auto text-gray-400" />
        </button>
      </h3>
      {open && <div id={`${id}-panel`} className="pb-5">{children}</div>}
    </section>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────

export function CopyButton({ text, label = "Copy", onCopied, className }: { text: string; label?: string; onCopied?: () => void; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try { await navigator.clipboard.writeText(text); setDone(true); onCopied?.(); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ }
      }}
      aria-label={`${label}: ${text.slice(0, 60)}`}
      className={cn("inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-forest-700 px-2 min-h-[32px] rounded-lg hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-500", className)}
    >
      <Icon name={done ? "check" : "copy"} className="w-3.5 h-3.5" />
      {done ? "Copied" : label}
    </button>
  );
}

// ─── Completeness bar ─────────────────────────────────────────────────────────

export function CompletenessBar({ known, total, compact }: { known: number; total: number; compact?: boolean }) {
  const pct = total ? Math.round((known / total) * 100) : 0;
  const tone = pct === 100 ? "bg-forest-600" : pct >= 50 ? "bg-[#6E7C5C]" : "bg-amber-500";
  return (
    <div className={cn("flex items-center gap-2", compact ? "min-w-[110px]" : "")}>
      <div className="h-1.5 flex-1 rounded-full bg-gray-200 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={known} aria-label={`${known} of ${total} rules known`}>
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-600 whitespace-nowrap tabular-nums">{known} of {total}{compact ? "" : " rules"}</span>
    </div>
  );
}

/** Wraps search matches in <mark>. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const words = query.trim().split(/\s+/).filter((w) => w.length > 0).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join("|")})`, "gi"));
  return <>{parts.map((p, i) => (i % 2 === 1 ? <mark key={i} className="bg-[#C9A96E]/30 text-inherit rounded-sm px-0.5">{p}</mark> : p))}</>;
}

export const COI_STYLE: Record<string, string> = {
  Yes: "bg-forest-50 text-forest-800 ring-forest-200",
  No: "bg-gray-100 text-gray-700 ring-gray-200",
  "Confirm Per Move": "bg-amber-50 text-amber-800 ring-amber-200",
  Unknown: "bg-amber-50 text-amber-800 ring-amber-200",
};

export function CoiBadge({ value }: { value: string }) {
  const v = value || "Unknown";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", COI_STYLE[v] ?? COI_STYLE.Unknown)}>
      {v === "Unknown" && <Icon name="alert" className="w-3 h-3" />}
      {v === "Unknown" ? "Ask" : v}
    </span>
  );
}
