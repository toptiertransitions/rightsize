"use client";

import { useState, useEffect, useCallback } from "react";
import type { ZellePayment } from "@/lib/types";

const HORIZONS = [
  { label: "7 days",  value: "7" },
  { label: "14 days", value: "14" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "All time", value: "all" },
];

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtCurrency(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ZellePayments() {
  const [days, setDays] = useState("7");
  const [payments, setPayments] = useState<ZellePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/zelle?days=${days}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setConnected(data.connected ?? true);
      setPayments(data.payments ?? []);
      setLastRefreshed(new Date());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [days]);

  // Reload when days filter changes
  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => load(true), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  const total = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="mt-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Zelle Payment Feed</h2>
          {lastRefreshed && (
            <p className="text-xs text-gray-400 mt-0.5">
              Last refreshed {lastRefreshed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </p>
          )}
        </div>
        <button
          onClick={() => load(false)}
          disabled={loading}
          className="text-xs text-forest-600 hover:text-forest-700 underline disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* Time horizon filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {HORIZONS.map((h) => (
          <button
            key={h.value}
            onClick={() => setDays(h.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              days === h.value
                ? "bg-forest-600 text-white border-forest-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-forest-400"
            }`}
          >
            {h.label}
          </button>
        ))}
      </div>

      {/* Not connected warning */}
      {!connected && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Gmail is not connected. Connect an account in{" "}
          <a href="/crm/settings" className="underline font-medium">CRM Settings</a>{" "}
          to see Zelle payments.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      {connected && !error && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-4 py-2.5 font-medium text-gray-600">Payer</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 text-right">Amount</th>
                <th className="px-4 py-2.5 font-medium text-gray-600">Sent On</th>
                <th className="px-4 py-2.5 font-medium text-gray-600">Memo</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3"><div className="h-3 w-32 bg-gray-100 rounded animate-pulse" /></td>
                    <td className="px-4 py-3 text-right"><div className="h-3 w-16 bg-gray-100 rounded animate-pulse ml-auto" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-24 bg-gray-100 rounded animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-3 w-40 bg-gray-100 rounded animate-pulse" /></td>
                  </tr>
                ))
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-xs">
                    No Zelle payments found in this time range.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.messageId} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{p.payerName}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-green-700">{fmtCurrency(p.amount)}</td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(p.sentOn)}</td>
                    <td className="px-4 py-2.5 text-gray-500">{p.memo || <span className="text-gray-300">—</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
            {!loading && payments.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td className="px-4 py-2.5 text-xs font-medium text-gray-500">{payments.length} payment{payments.length !== 1 ? "s" : ""}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-semibold text-green-700">{fmtCurrency(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
