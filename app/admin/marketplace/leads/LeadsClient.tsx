"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { releaseLeadAction } from "./actions";

export interface AdminLeadRow {
  id: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  tenantId: string;
  category: string;
  partnerId: string;
  partnerName: string;
  partnerHasEmail: boolean;
  answers: Array<{ label: string; value: string }>;
  requestedAt: string;
  status: string;
  statusUpdatedAt: string;
  releasedAt: string;
  releasedBy: string;
  fee: string;
}

type Filter = "held" | "released" | "all";

function fmt(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_STYLE: Record<string, string> = {
  Contacted: "bg-blue-900/40 text-blue-300",
  Engaged: "bg-green-900/40 text-green-300",
  Declined: "bg-gray-800 text-gray-400",
  Billed: "bg-purple-900/40 text-purple-300",
};

export function LeadsClient({ rows, focusId }: { rows: AdminLeadRow[]; focusId: string | null }) {
  const router = useRouter();
  const focused = focusId ? rows.find((r) => r.id === focusId) : undefined;
  const [filter, setFilter] = useState<Filter>(focused ? (focused.releasedAt ? "released" : "held") : "held");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(focused?.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const counts = { held: rows.filter((r) => !r.releasedAt).length, released: rows.filter((r) => r.releasedAt).length, all: rows.length };
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "held" && r.releasedAt) return false;
      if (filter === "released" && !r.releasedAt) return false;
      return !term || [r.clientName, r.clientEmail, r.partnerName, r.category].some((v) => v.toLowerCase().includes(term));
    });
  }, [rows, filter, q]);

  async function release(r: AdminLeadRow) {
    const warn = r.partnerHasEmail ? "" : "\n\nThis partner has no email on file, so they'll only see it in their portal (if they have an account).";
    if (!window.confirm(`Release ${r.clientName || "this lead"} to ${r.partnerName}?\n\nThey'll see the client's name, email, phone, category and answers, and get an email. The client gets a "we've reached out" confirmation.${warn}`)) return;
    setBusy(r.id);
    setMessage(null);
    const res = await releaseLeadAction(r.id);
    setBusy(null);
    if (!res.ok) {
      setMessage({ ok: false, text: res.error });
      return;
    }
    const how = [res.emailed && "emailed", res.pushed && "sent a push notification"].filter(Boolean).join(" and ");
    setMessage({ ok: true, text: `Released to ${r.partnerName}${how ? ` (${how})` : ""}.` });
    router.refresh();
  }

  const tab = (key: Filter, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(key)}
      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === key ? "bg-forest-600 text-white" : "text-gray-400 hover:text-white"}`}
    >
      {label} <span className="opacity-70">{counts[key]}</span>
    </button>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 border border-gray-800 rounded-xl p-1">
          {tab("held", "Held")}
          {tab("released", "Released")}
          {tab("all", "All")}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search client, partner, category"
          className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5 w-72 max-w-full"
        />
      </div>

      {message && <p className={`text-sm mb-3 ${message.ok ? "text-green-400" : "text-red-400"}`} role="status">{message.text}</p>}

      {shown.length === 0 ? (
        <p className="text-sm text-gray-500 bg-gray-900 border border-gray-800 rounded-xl p-6">
          {filter === "held" ? "No leads waiting for release." : "No leads here yet."}
        </p>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
          {shown.map((r) => (
            <div key={r.id} className={r.id === focusId ? "bg-gray-800/40" : ""}>
              <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="flex-1 min-w-[240px] text-left" aria-expanded={open === r.id}>
                  <span className="block text-sm font-medium text-white">
                    {r.clientName || "(no name)"} <span className="text-gray-500 font-normal">&rarr;</span> {r.partnerName}
                  </span>
                  <span className="block text-xs text-gray-500 mt-0.5">{r.category || "Unknown category"} · requested {fmt(r.requestedAt)}</span>
                </button>
                {r.releasedAt ? (
                  <span className="text-xs text-gray-400 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded-full mr-2 ${STATUS_STYLE[r.status] ?? "bg-gray-800 text-gray-300"}`}>
                      {r.status === "Delivered" ? "Not opened yet" : r.status}
                    </span>
                    released {fmt(r.releasedAt)}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => release(r)}
                    className="bg-forest-600 hover:bg-forest-700 text-white text-sm font-medium rounded-lg px-3 py-1.5 disabled:opacity-50"
                  >
                    {busy === r.id ? "Releasing…" : "Release to partner"}
                  </button>
                )}
              </div>
              {open === r.id && (
                <div className="px-4 pb-4 grid gap-4 md:grid-cols-2 text-sm">
                  <div className="space-y-1 text-gray-300">
                    <p><span className="text-gray-500">Email:</span> {r.clientEmail || "—"}</p>
                    <p><span className="text-gray-500">Phone:</span> {r.clientPhone || "—"}</p>
                    <p><span className="text-gray-500">Referral terms at request (never shown to the partner):</span> {r.fee}</p>
                    {r.releasedBy && <p><span className="text-gray-500">Released by:</span> {r.releasedBy}</p>}
                    {r.statusUpdatedAt && <p><span className="text-gray-500">Last update:</span> {fmt(r.statusUpdatedAt)}</p>}
                    <p className="pt-1 flex gap-4">
                      <Link href={`/admin/marketplace/partners/${r.partnerId}`} className="text-forest-400 hover:underline">Partner</Link>
                      {r.tenantId && <Link href={`/admin/impersonate?tenantId=${r.tenantId}`} className="text-forest-400 hover:underline">Project</Link>}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Client&apos;s answers</p>
                    {r.answers.length === 0 ? (
                      <p className="text-gray-500">No answers recorded.</p>
                    ) : (
                      <dl className="space-y-1.5">
                        {r.answers.map((a) => (
                          <div key={a.label}>
                            <dt className="text-gray-500 text-xs">{a.label}</dt>
                            <dd className="text-gray-200">{a.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
