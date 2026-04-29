"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function WeeklyEmailButton({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"client" | "staff" | null>(null);
  const [staffNotes, setStaffNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);

  function reset() {
    setOpen(false);
    setType(null);
    setStaffNotes("");
    setSending(false);
    setResult(null);
  }

  async function handleSend() {
    if (!type) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/plan/weekly-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, type, staffNotes: type === "staff" ? staffNotes : undefined }),
      });
      if (!res.ok) throw new Error();
      setResult("success");
    } catch {
      setResult("error");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl border border-forest-300 text-forest-700 hover:bg-forest-50 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        Send Weekly Emails
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="bg-forest-700 px-6 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold text-base">Send Weekly Email</p>
                  <p className="text-forest-200 text-xs mt-0.5">Sent to you for review before forwarding</p>
                </div>
                <button onClick={reset} className="text-forest-300 hover:text-white transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              {result === "success" ? (
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="font-semibold text-gray-900 mb-1">Email sent to you!</p>
                  <p className="text-sm text-gray-500 mb-5">Review it in your inbox, then forward it to the {type === "client" ? "client" : "team"}.</p>
                  <button onClick={reset} className="text-sm font-medium text-forest-700 hover:text-forest-800">
                    Close
                  </button>
                </div>
              ) : (
                <>
                  {/* Email type selection */}
                  <p className="text-sm font-medium text-gray-700 mb-3">Choose email type</p>
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    {/* Client */}
                    <button
                      onClick={() => setType("client")}
                      className={cn(
                        "flex flex-col items-start p-4 rounded-xl border-2 text-left transition-all",
                        type === "client"
                          ? "border-forest-500 bg-forest-50"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      )}
                    >
                      <span className="text-2xl mb-2">👤</span>
                      <p className={cn("text-sm font-semibold", type === "client" ? "text-forest-800" : "text-gray-800")}>
                        Client Update
                      </p>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                        Project progress, upcoming schedule, items summary & recent sales
                      </p>
                    </button>

                    {/* Staff */}
                    <button
                      onClick={() => setType("staff")}
                      className={cn(
                        "flex flex-col items-start p-4 rounded-xl border-2 text-left transition-all",
                        type === "staff"
                          ? "border-forest-500 bg-forest-50"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      )}
                    >
                      <span className="text-2xl mb-2">👥</span>
                      <p className={cn("text-sm font-semibold", type === "staff" ? "text-forest-800" : "text-gray-800")}>
                        Staff Schedule
                      </p>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                        Upcoming shifts with dates, times, locations & team assignments
                      </p>
                    </button>
                  </div>

                  {/* Staff notes textarea */}
                  {type === "staff" && (
                    <div className="mb-5">
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Internal Team Notes
                        <span className="font-normal text-gray-400 ml-1">(optional)</span>
                      </label>
                      <textarea
                        value={staffNotes}
                        onChange={(e) => setStaffNotes(e.target.value)}
                        placeholder="Add any notes, reminders, or context for the team this week…"
                        rows={4}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-400 resize-none"
                      />
                    </div>
                  )}

                  {result === "error" && (
                    <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200 mb-4">
                      Something went wrong. Please try again.
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSend}
                      disabled={!type || sending}
                      className="flex-1 h-10 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      {sending ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                          Sending…
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          Send to Me
                        </>
                      )}
                    </button>
                    <button
                      onClick={reset}
                      disabled={sending}
                      className="h-10 px-4 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
