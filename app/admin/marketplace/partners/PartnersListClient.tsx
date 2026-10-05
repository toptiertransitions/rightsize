"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MarketplacePartner, MarketplaceListingStatus, MarketplaceDeliveryMode } from "@/lib/marketplace/types";
import { bulkUpdatePartnerLifecycleAction } from "../actions";

interface Row {
  partner: MarketplacePartner;
  categoryLabels: string[];
  listingStatus: MarketplaceListingStatus;
  completeness: number;
  hasReferralFee: boolean;
}

interface Props {
  rows: Row[];
  categories: { id: string; label: string }[];
}

function toCsv(rows: Row[]): string {
  const header = ["Company", "Categories", "Lifecycle", "Listing Status", "Completeness %", "City", "State", "Email", "Phone"];
  const lines = rows.map((r) => [
    r.partner.companyName,
    r.categoryLabels.join("; "),
    r.partner.lifecycleStatus,
    r.listingStatus,
    String(r.completeness),
    r.partner.city,
    r.partner.state,
    r.partner.email,
    r.partner.phone,
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  return [header.join(","), ...lines].join("\n");
}

export function PartnersListClient({ rows, categories }: Props) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [deliveryModeFilter, setDeliveryModeFilter] = useState<"" | MarketplaceDeliveryMode>("");
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [referralEligibleOnly, setReferralEligibleOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMsg, setBulkMsg] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  const categoryLabel = useMemo(() => new Map(categories.map((c) => [c.id, c.label])), [categories]);

  const filtered = rows.filter((r) => {
    if (search && !r.partner.companyName.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter && !r.categoryLabels.includes(categoryLabel.get(categoryFilter) ?? "")) return false;
    if (deliveryModeFilter && r.partner.deliveryMode !== deliveryModeFilter) return false;
    if (incompleteOnly && r.completeness >= 100) return false;
    if (referralEligibleOnly && !r.hasReferralFee) return false;
    return true;
  });

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function runBulk(status: "Paused" | "Archived" | "Live") {
    setBulkLoading(true);
    setBulkMsg("");
    const result = await bulkUpdatePartnerLifecycleAction(Array.from(selected), status);
    setBulkLoading(false);
    if (!result.ok) { setBulkMsg(result.error); return; }
    setBulkMsg(`Updated ${selected.size} partner(s).`);
    setSelected(new Set());
  }

  function exportCsv() {
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marketplace-partners-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">Partners</h1>
        <button onClick={exportCsv} className="text-sm px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors">
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          placeholder="Search company name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 px-3 rounded-lg border border-gray-700 bg-gray-900 text-sm text-white w-56 focus:outline-none focus:ring-2 focus:ring-forest-500/30"
        />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-9 px-3 rounded-lg border border-gray-700 bg-gray-900 text-sm text-white">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={deliveryModeFilter} onChange={(e) => setDeliveryModeFilter(e.target.value as "" | MarketplaceDeliveryMode)} className="h-9 px-3 rounded-lg border border-gray-700 bg-gray-900 text-sm text-white">
          <option value="">Any delivery mode</option>
          <option value="In-person">In-person</option>
          <option value="Virtual">Virtual</option>
          <option value="Both">Both</option>
        </select>
        <label className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-300">
          <input type="checkbox" checked={incompleteOnly} onChange={(e) => setIncompleteOnly(e.target.checked)} />
          Incomplete only
        </label>
        <label className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-300">
          <input type="checkbox" checked={referralEligibleOnly} onChange={(e) => setReferralEligibleOnly(e.target.checked)} />
          Has referral fee
        </label>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5">
          <span className="text-sm text-gray-300">{selected.size} selected</span>
          <button disabled={bulkLoading} onClick={() => runBulk("Paused")} className="text-sm px-3 py-1 rounded-md border border-gray-600 text-gray-300 hover:bg-gray-800 disabled:opacity-50">Pause</button>
          <button disabled={bulkLoading} onClick={() => runBulk("Live")} className="text-sm px-3 py-1 rounded-md border border-gray-600 text-gray-300 hover:bg-gray-800 disabled:opacity-50">Reactivate</button>
          <button disabled={bulkLoading} onClick={() => runBulk("Archived")} className="text-sm px-3 py-1 rounded-md border border-red-800 text-red-400 hover:bg-red-900/30 disabled:opacity-50">Archive</button>
          {bulkMsg && <span className="text-xs text-gray-500">{bulkMsg}</span>}
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 w-8"></th>
              <th className="px-4 py-2.5">Company</th>
              <th className="px-4 py-2.5">Categories</th>
              <th className="px-4 py-2.5">Lifecycle</th>
              <th className="px-4 py-2.5">Listing Status</th>
              <th className="px-4 py-2.5">Completeness</th>
              <th className="px-4 py-2.5">Location</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.partner.id} className="border-b border-gray-800/60 last:border-0 hover:bg-gray-800/30">
                <td className="px-4 py-2.5">
                  <input type="checkbox" checked={selected.has(r.partner.id)} onChange={() => toggleSelected(r.partner.id)} />
                </td>
                <td className="px-4 py-2.5">
                  <Link href={`/admin/marketplace/partners/${r.partner.id}`} className="text-gray-100 hover:text-forest-400 font-medium">
                    {r.partner.companyName}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-gray-400">{r.categoryLabels.join(", ") || "—"}</td>
                <td className="px-4 py-2.5 text-gray-300">{r.partner.lifecycleStatus}</td>
                <td className="px-4 py-2.5 text-gray-300">{r.listingStatus}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.completeness === 100 ? "bg-green-900/40 text-green-300" : "bg-amber-900/40 text-amber-300"}`}>
                    {r.completeness}%
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-400">{[r.partner.city, r.partner.state].filter(Boolean).join(", ") || "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No partners match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500 mt-2">{filtered.length} of {rows.length} partners</p>
    </div>
  );
}
