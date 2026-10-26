"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// TTTAdmin / TTTManager only (the page gates rendering; each route re-checks).
// Every email goes to the signed-in user only, for review before forwarding.
const EMAILS = [
  { type: "mover-quote", label: "Email Me: Mover Quote Request" },
  { type: "team-brief", label: "Email Me: Team Brief" },
  { type: "client-move-week", label: "Email Me: Client Move Week Details" },
] as const;

type EmailType = (typeof EMAILS)[number]["type"];
type Toast = { ok: true; msg: string } | { ok: false; msg: string; retry: EmailType };

export function EmailMeButtons({ tenantId }: { tenantId: string }) {
  const [sending, setSending] = useState<EmailType | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  useEffect(() => {
    if (!toast?.ok) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  async function send(type: EmailType, opts: { confirmEmpty?: boolean } = {}) {
    setSending(type);
    setToast(null);
    setConfirmEmpty(false);
    try {
      const res = await fetch(`/api/plan/email-me/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, confirmEmpty: opts.confirmEmpty }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.needsConfirm) {
        setConfirmEmpty(true);
        return;
      }
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't send the email");
      setToast({ ok: true, msg: `Sent to ${data.email}` });
    } catch (e) {
      setToast({ ok: false, msg: e instanceof Error ? e.message : "Couldn't send the email", retry: type });
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {EMAILS.map(({ type, label }) => (
          <button
            key={type}
            onClick={() => send(type)}
            disabled={sending !== null}
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl border border-forest-300 text-forest-700 hover:bg-forest-50 transition-colors",
              sending !== null && "opacity-60 cursor-not-allowed",
            )}
          >
            {sending === type ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            )}
            {sending === type ? "Sending…" : label}
          </button>
        ))}
      </div>

      {confirmEmpty && (
        <div className="max-w-sm rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          <p className="font-semibold">No catalog items are marked To Be Moved.</p>
          <p className="mt-0.5">The quote will go out with no inventory and no PDF attached. Send anyway?</p>
          <div className="mt-2 flex gap-2">
            <button onClick={() => send("mover-quote", { confirmEmpty: true })} className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700">Send anyway</button>
            <button onClick={() => setConfirmEmpty(false)} className="px-2.5 py-1 rounded-lg text-amber-800 hover:bg-amber-100">Cancel</button>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lg",
            toast.ok ? "bg-forest-700 text-white" : "bg-red-600 text-white",
          )}
          role="status"
        >
          <span>{toast.msg}</span>
          {!toast.ok && (
            <button onClick={() => send(toast.retry)} className="rounded-lg bg-white/20 px-2.5 py-1 font-medium hover:bg-white/30">Retry</button>
          )}
          <button onClick={() => setToast(null)} aria-label="Dismiss" className="opacity-70 hover:opacity-100">✕</button>
        </div>
      )}
    </div>
  );
}
