"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import type { BrandProjectRow } from "@/lib/brands/projects";
import { assignProjectsBrandAction } from "../actions";

type Brand = { id: string; name: string; status: string };
type SortKey = "name" | "brand" | "lastActivity" | "createdAt" | "linkedUsers";

function fmtDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ProjectsTable({ rows, brands, canImpersonate }: { rows: BrandProjectRow[]; brands: Brand[]; canImpersonate: boolean }) {
  const router = useRouter();
  const clerk = useClerk();
  const brandName = useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands]);

  const [q, setQ] = useState("");
  const [brandFilter, setBrandFilter] = useState("all"); // all | none | <brandId>
  const [kindFilter, setKindFilter] = useState("all");
  const [signedFilter, setSignedFilter] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBrand, setBulkBrand] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (term && ![r.name, r.location, r.referringPartner, brandName.get(r.brandId) ?? ""].some((v) => v.toLowerCase().includes(term))) return false;
      if (brandFilter === "none" && r.brandId) return false;
      if (brandFilter !== "all" && brandFilter !== "none" && r.brandId !== brandFilter) return false;
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      if (signedFilter === "yes" && !r.signed) return false;
      if (signedFilter === "no" && r.signed) return false;
      return true;
    });
    const val = (r: BrandProjectRow): string | number =>
      sort.key === "brand" ? (brandName.get(r.brandId) ?? "~") : sort.key === "linkedUsers" ? r.linkedUsers : r[sort.key] || "";
    return out.sort((a, b) => {
      const x = val(a), y = val(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [rows, q, brandFilter, kindFilter, signedFilter, sort, brandName]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "lastActivity" || key === "createdAt" ? -1 : 1 }));
  }

  async function assign(ids: string[], brandId: string) {
    const label = brandId ? brandName.get(brandId) ?? "this brand" : "Top Tier (no brand)";
    const what = ids.length === 1 ? `"${rows.find((r) => r.id === ids[0])?.name ?? "this project"}"` : `${ids.length} projects`;
    if (!window.confirm(`Set ${what} to ${label}? The client and their family will see this branding.`)) return false;
    setBusy(true);
    setMessage(null);
    const res = await assignProjectsBrandAction(ids, brandId);
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: res.error });
      return false;
    }
    setMessage({ ok: true, text: `Updated ${res.data ?? 0} project${res.data === 1 ? "" : "s"}.` });
    setSelected(new Set());
    router.refresh();
    return true;
  }

  async function viewAsClient(r: BrandProjectRow) {
    setViewing(r.id);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "impersonate", clerkUserId: r.ownerClerkId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't start View as");
      // Same actor-session flow as Admin > Users "View As"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (clerk as any).client.signIn.create({ strategy: "ticket", ticket: data.token });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (clerk as any).setActive({ session: result.createdSessionId });
      router.push("/home");
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Couldn't start View as" });
      setViewing(null);
    }
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const th = (key: SortKey, label: string, cls = "text-left") => (
    <th className={`${cls} px-3 py-3`}>
      <button type="button" onClick={() => toggleSort(key)} className="uppercase tracking-wide hover:text-gray-300">
        {label}{sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
  const selectCls = "bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-2 py-1.5";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search client, location, partner, brand"
          className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5 w-72 max-w-full"
        />
        <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className={selectCls} aria-label="Filter by brand">
          <option value="all">All brands</option>
          <option value="none">No tenant (Top Tier)</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className={selectCls} aria-label="Filter by type">
          <option value="all">TTT + Self-serve</option>
          <option value="TTT">TTT</option>
          <option value="Self-serve">Self-serve</option>
        </select>
        <select value={signedFilter} onChange={(e) => setSignedFilter(e.target.value)} className={selectCls} aria-label="Filter by signed">
          <option value="all">Signed or not</option>
          <option value="yes">Signed</option>
          <option value="no">Not signed</option>
        </select>
        <span className="text-xs text-gray-500 ml-auto">{filtered.length} shown</span>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-gray-900 border border-forest-700 rounded-xl px-3 py-2 mb-3">
          <span className="text-sm text-white">{selected.size} selected</span>
          <select value={bulkBrand} onChange={(e) => setBulkBrand(e.target.value)} className={selectCls} aria-label="Brand to assign">
            <option value="">Top Tier (no brand)</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}{b.status !== "Active" ? " (Draft)" : ""}</option>)}
          </select>
          <button type="button" disabled={busy} onClick={() => assign(Array.from(selected), bulkBrand)} className="bg-forest-600 hover:bg-forest-700 text-white text-sm font-medium rounded-lg px-3 py-1.5 disabled:opacity-50">
            {busy ? "Saving…" : "Assign"}
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-sm text-gray-400 hover:text-white">Clear</button>
        </div>
      )}

      {message && <p className={`text-sm mb-3 ${message.ok ? "text-green-400" : "text-red-400"}`} role="status">{message.text}</p>}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[960px]">
          <thead className="text-xs text-gray-500 border-b border-gray-800">
            <tr>
              <th className="px-3 py-3 w-8">
                <input
                  type="checkbox"
                  aria-label="Select all shown"
                  checked={allVisibleSelected}
                  onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(filtered.map((r) => r.id)))}
                />
              </th>
              {th("name", "Client")}
              <th className="text-left px-3 py-3 uppercase tracking-wide">Type</th>
              <th className="text-left px-3 py-3 uppercase tracking-wide">Signed</th>
              <th className="text-left px-3 py-3 uppercase tracking-wide">Referring partner</th>
              {th("brand", "Brand")}
              {th("linkedUsers", "Users", "text-right")}
              {th("lastActivity", "Last activity")}
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-gray-800/40">
                <td className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.name}`}
                    checked={selected.has(r.id)}
                    onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <span className="block text-white font-medium truncate max-w-[240px]">{r.name}</span>
                  {r.location && <span className="block text-xs text-gray-500">{r.location}</span>}
                </td>
                <td className="px-3 py-2.5 text-gray-300">{r.kind}</td>
                <td className="px-3 py-2.5">{r.signed ? <span className="text-green-400">Yes</span> : <span className="text-gray-500">No</span>}</td>
                <td className="px-3 py-2.5 text-gray-300 truncate max-w-[180px]">{r.referringPartner || <span className="text-gray-600">—</span>}</td>
                <td className="px-3 py-2.5">
                  <select
                    value={r.brandId}
                    disabled={busy}
                    onChange={(e) => { const v = e.target.value; e.target.value = r.brandId; assign([r.id], v); }}
                    className={`${selectCls} max-w-[200px]`}
                    aria-label={`Brand for ${r.name}`}
                  >
                    <option value="">Top Tier</option>
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.name}{b.status !== "Active" ? " (Draft)" : ""}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2.5 text-right text-gray-300 tabular-nums">{r.linkedUsers}</td>
                <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{fmtDate(r.lastActivity)}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {canImpersonate && r.ownerClerkId && (
                    <button type="button" disabled={viewing !== null} onClick={() => viewAsClient(r)} className="text-xs text-forest-400 hover:text-forest-300 disabled:opacity-50">
                      {viewing === r.id ? "Opening…" : "View as client"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No projects match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
