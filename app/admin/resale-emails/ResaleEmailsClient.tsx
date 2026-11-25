"use client";

import { useMemo, useState } from "react";
import { RESALE_EMAIL_LABEL, RESALE_EMAIL_ORDER, type ResaleEmailType } from "@/lib/resale-emails/constants";
import type { ResaleLogRow } from "@/lib/resale-emails/store";

export interface ResaleProjectRow {
  id: string;
  name: string;
  archived: boolean;
  listedCount: number;
  anchor?: string;
  anchorSource?: string;
  anchorLog: string;
  paused: boolean;
  dueDays?: string[];
}

const DONE = new Set(["claimed", "sent", "skipped-before-launch"]);
const STATUS_STYLE: Record<string, string> = {
  sent: "bg-forest-900/60 text-forest-300",
  claimed: "bg-amber-900/50 text-amber-300",
  "skipped-before-launch": "bg-gray-800 text-gray-400",
  "dry-run": "bg-sky-900/50 text-sky-300",
  failed: "bg-red-900/50 text-red-300",
  skipped: "bg-gray-800 text-gray-400",
  duplicate: "bg-gray-800 text-gray-500",
};
const SHORT: Record<ResaleEmailType, string> = { "hands-on": "Hands-on", day30: "Day 30", day60: "Day 60", day90: "Day 90" };

const fmtTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : "";

function Badge({ status }: { status: string }) {
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_STYLE[status] ?? "bg-gray-800 text-gray-400"}`}>{status}</span>;
}

export function ResaleEmailsClient({ projects: initialProjects, log: initialLog }: { projects: ResaleProjectRow[]; log: ResaleLogRow[] }) {
  const [projects, setProjects] = useState(initialProjects);
  const [log, setLog] = useState(initialLog);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [preview, setPreview] = useState<{ type: ResaleEmailType; subject: string; html: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [anchorInput, setAnchorInput] = useState("");

  const selected = projects.find((p) => p.id === selectedId) ?? null;
  const visible = projects.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()));
  const logFor = (id: string) => log.filter((r) => r.tenantId === id);
  const latestStatus = (id: string, type: ResaleEmailType) => {
    const rows = logFor(id).filter((r) => r.emailType === type);
    return (rows.find((r) => DONE.has(r.status)) ?? rows[rows.length - 1])?.status;
  };
  const skippedBeforeLaunch = useMemo(() => log.filter((r) => r.status === "skipped-before-launch"), [log]);

  function select(p: ResaleProjectRow) {
    setSelectedId(p.id);
    setPreview(null);
    setMessage(null);
    setAnchorInput(p.anchor ?? "");
  }

  async function refresh(id: string) {
    const res = await fetch(`/api/admin/resale-emails?tenantId=${id}`);
    if (!res.ok) return;
    const data = await res.json() as { state: { anchorDate?: string; anchorSource?: string; anchorLog: string; paused: boolean }; log: ResaleLogRow[] };
    setLog((prev) => [...prev.filter((r) => r.tenantId !== id), ...data.log]);
    setProjects((prev) => prev.map((p) => p.id === id ? {
      ...p,
      paused: data.state.paused,
      anchor: data.state.anchorDate ?? p.anchor,
      anchorSource: data.state.anchorDate ? data.state.anchorSource : p.anchorSource,
      anchorLog: data.state.anchorLog,
    } : p));
  }

  async function showPreview(type: ResaleEmailType) {
    if (!selected) return;
    setBusy(`preview-${type}`);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/resale-emails?tenantId=${selected.id}&type=${type}`);
      const data = await res.json();
      if (!res.ok) { setPreview(null); setMessage({ ok: false, text: data.error ?? "Preview failed" }); return; }
      setPreview({ type, subject: data.subject, html: data.html });
    } finally { setBusy(null); }
  }

  async function act(action: string, extra: Record<string, string> = {}) {
    if (!selected) return;
    setBusy(action + (extra.type ?? ""));
    setMessage(null);
    try {
      const res = await fetch("/api/admin/resale-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, tenantId: selected.id, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      const text =
        data.status === "sent" ? `Sent to ${data.recipients?.length ?? 0} Admins and Managers` :
        data.status === "already-sent" ? "Already sent for this project. Use Resend to send it again." :
        data.reason ?? data.error ?? (res.ok ? "Saved" : "Something went wrong");
      setMessage({ ok: res.ok && data.status !== "already-sent", text });
      await refresh(selected.id);
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-6">
        {/* Projects */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-gray-800">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search projects…"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-forest-500"
            />
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-gray-500 sticky top-0 bg-gray-900">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Project</th>
                  <th className="text-left px-2 py-2 font-medium">Anchor</th>
                  {RESALE_EMAIL_ORDER.map((t) => <th key={t} className="px-1 py-2 font-medium">{SHORT[t]}</th>)}
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => select(p)}
                    className={`border-t border-gray-800 cursor-pointer ${selectedId === p.id ? "bg-forest-900/30" : "hover:bg-gray-800/60"}`}
                  >
                    <td className="px-3 py-2 text-white">
                      {p.name}
                      {p.paused && <span className="ml-1.5 text-[10px] text-amber-400">paused</span>}
                      {p.archived && <span className="ml-1.5 text-[10px] text-gray-500">archived</span>}
                    </td>
                    <td className="px-2 py-2 text-gray-400 whitespace-nowrap">{p.anchor ?? "none"}</td>
                    {RESALE_EMAIL_ORDER.map((t) => {
                      const s = latestStatus(p.id, t);
                      return <td key={t} className="px-1 py-2 text-center">{s ? <Badge status={s} /> : <span className="text-gray-700">·</span>}</td>;
                    })}
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">No projects with resale emails yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected project */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          {!selected ? (
            <p className="text-gray-500 text-sm">Pick a project to preview its emails, pause it, correct its anchor date, or send and resend.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-white">{selected.name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selected.listedCount} Listed ProFound Finds item{selected.listedCount === 1 ? "" : "s"} · Anchor {selected.anchor ?? "none"}
                  {selected.anchorSource ? ` (${selected.anchorSource})` : ""}
                  {selected.dueDays?.length ? ` · Day 30 ${selected.dueDays[0]} · Day 60 ${selected.dueDays[1]} · Day 90 ${selected.dueDays[2]}` : ""}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => act(selected.paused ? "unpause" : "pause")}
                  disabled={!!busy}
                  className={`px-3 py-1.5 text-xs rounded-lg disabled:opacity-50 ${selected.paused ? "bg-amber-600 hover:bg-amber-500 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-200"}`}
                >
                  {selected.paused ? "Paused: resume sequence" : "Pause sequence"}
                </button>
                <span className="text-gray-700">|</span>
                <label className="text-xs text-gray-400">Anchor date</label>
                <input
                  type="date"
                  value={anchorInput}
                  onChange={(e) => setAnchorInput(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-forest-500"
                />
                <button
                  onClick={() => act("setAnchor", { day: anchorInput })}
                  disabled={!!busy || !anchorInput || anchorInput === selected.anchor}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded-lg disabled:opacity-40"
                >
                  Override
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => act("sendNow", { type: "hands-on" })}
                  disabled={!!busy}
                  className="px-3 py-1.5 bg-forest-600 hover:bg-forest-500 text-white text-xs rounded-lg disabled:opacity-50"
                  title="For Full invoices sent outside Rightsize (e.g. QuickBooks). Goes out once per project."
                >
                  {busy === "sendNowhands-on" ? "Sending…" : "Send hands-on complete email now"}
                </button>
              </div>

              <div className="border border-gray-800 rounded-lg divide-y divide-gray-800">
                {RESALE_EMAIL_ORDER.map((t) => {
                  const rows = logFor(selected.id).filter((r) => r.emailType === t);
                  return (
                    <div key={t} className="flex items-center gap-2 px-3 py-2">
                      <span className="text-sm text-white flex-1">{RESALE_EMAIL_LABEL[t]}</span>
                      <span className="flex gap-1">{rows.slice(-3).map((r) => <Badge key={r.id} status={r.manualResend ? "resend" : r.status} />)}</span>
                      <button
                        onClick={() => showPreview(t)}
                        disabled={!!busy}
                        className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded disabled:opacity-50"
                      >
                        {busy === `preview-${t}` ? "…" : "Preview"}
                      </button>
                      <button
                        onClick={() => act("resend", { type: t })}
                        disabled={!!busy}
                        className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded disabled:opacity-50"
                        title="Sends again even if it already went out, and logs it as a manual resend"
                      >
                        {busy === `resend${t}` ? "…" : "Resend"}
                      </button>
                    </div>
                  );
                })}
              </div>

              {message && <p className={`text-xs ${message.ok ? "text-forest-300" : "text-amber-300"}`}>{message.text}</p>}

              {selected.anchorLog && (
                <details className="text-xs text-gray-400">
                  <summary className="cursor-pointer text-gray-500">Anchor history</summary>
                  <pre className="whitespace-pre-wrap mt-1 font-mono text-[11px]">{selected.anchorLog}</pre>
                </details>
              )}
            </div>
          )}
        </div>
      </div>

      {preview && selected && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-800 text-sm text-gray-300 flex items-center justify-between gap-3">
            <span className="truncate">Subject: <span className="text-white">{preview.subject}</span></span>
            <button onClick={() => setPreview(null)} className="text-gray-500 hover:text-white text-xs">Close</button>
          </div>
          <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="w-full bg-[#F4F1EA]" style={{ height: 1500 }} />
        </div>
      )}

      {/* Send log */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Send log</h2>
          <span className="text-xs text-gray-500">{skippedBeforeLaunch.length} milestone{skippedBeforeLaunch.length === 1 ? "" : "s"} skipped before launch</span>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="text-gray-500 sticky top-0 bg-gray-900">
              <tr>
                <th className="text-left px-4 py-2 font-medium">When</th>
                <th className="text-left px-2 py-2 font-medium">Project</th>
                <th className="text-left px-2 py-2 font-medium">Email</th>
                <th className="text-left px-2 py-2 font-medium">Status</th>
                <th className="text-left px-2 py-2 font-medium">Trigger / reason</th>
              </tr>
            </thead>
            <tbody>
              {[...log].reverse().slice(0, 300).map((r) => (
                <tr key={r.id} className="border-t border-gray-800 align-top">
                  <td className="px-4 py-1.5 text-gray-400 whitespace-nowrap">{fmtTime(r.sentAt ?? r.createdTime)}</td>
                  <td className="px-2 py-1.5 text-white">{r.projectName}</td>
                  <td className="px-2 py-1.5 text-gray-300 whitespace-nowrap">{SHORT[r.emailType] ?? r.emailType}</td>
                  <td className="px-2 py-1.5"><Badge status={r.status} />{r.manualResend && <span className="ml-1 text-[10px] text-gray-500">manual resend</span>}</td>
                  <td className="px-2 py-1.5 text-gray-400">{r.trigger}{r.reason ? ` · ${r.reason}` : ""}</td>
                </tr>
              ))}
              {log.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Nothing logged yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
