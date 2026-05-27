"use client";

import { useState, useMemo } from "react";
import type { PartnerLoyaltyRecord, PartnerLedgerEntry } from "@/lib/types";
import { TIER_COLORS, type TierName } from "@/lib/loyalty";

const EVENT_LABELS: Record<string, string> = {
  project_completed: "Project",
  manual_bonus: "Bonus",
  manual_redemption: "Redemption",
  silver_one_time_bonus: "Silver Bonus",
  year_reset: "Year Reset",
};

function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  const letters = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (name.slice(0, 2).toUpperCase());
  return (
    <div className="w-8 h-8 rounded-full bg-forest-700 text-white text-xs font-bold flex items-center justify-center shrink-0">
      {letters}
    </div>
  );
}

function TierBadge({ tier }: { tier: TierName }) {
  const color = TIER_COLORS[tier];
  return (
    <span
      className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: `${color}20`, color }}
    >
      {tier}
    </span>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function AdjustModal({
  partner,
  type,
  onClose,
  onDone,
}: {
  partner: PartnerLoyaltyRecord;
  type: "bonus" | "redeem";
  onClose: () => void;
  onDone: () => void;
}) {
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const n = parseInt(points, 10);
    if (!n || n <= 0) { setError("Enter a positive number"); return; }
    if (!note.trim()) { setError("Note is required"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/partner-loyalty/manual-adjustment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: partner.partnerId,
          pointsDelta: type === "redeem" ? -n : n,
          eventType: type === "redeem" ? "manual_redemption" : "manual_bonus",
          note: note.trim(),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Request failed");
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-base font-bold text-gray-900 mb-1">
          {type === "bonus" ? "Add Bonus Points" : "Redeem Points"}
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          {partner.companyName} — current balance: <strong>{partner.lifetimePoints} pts</strong>
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Points {type === "redeem" ? "to Redeem" : "to Add"}
            </label>
            <input
              type="number"
              min={1}
              value={points}
              onChange={e => setPoints(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              placeholder="e.g. 5"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required)</label>
            <textarea
              rows={2}
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              placeholder="e.g. Referral event attendance"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 h-10 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 h-10 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ background: type === "redeem" ? "#dc2626" : "#2d4a3e" }}
          >
            {loading ? "Saving…" : type === "redeem" ? "Redeem" : "Add Points"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordModal({
  partner,
  onClose,
}: {
  partner: PartnerLoyaltyRecord;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const send = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/partner-loyalty/reset-partner-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerEmail: partner.partnerEmail }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed");
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        {done ? (
          <>
            <p className="text-sm font-semibold text-green-700 mb-2">Sign-in link sent!</p>
            <p className="text-sm text-gray-500 mb-4">
              An email was sent to {partner.partnerEmail || partner.companyName}.
            </p>
            <button onClick={onClose} className="w-full h-10 rounded-xl bg-gray-100 text-sm font-medium text-gray-700">
              Close
            </button>
          </>
        ) : (
          <>
            <h3 className="text-base font-bold text-gray-900 mb-2">Send Sign-In Link</h3>
            <p className="text-sm text-gray-500 mb-4">
              Send a 24-hour sign-in link to <strong>{partner.partnerEmail || partner.companyName}</strong>?
            </p>
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 h-10 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={send}
                disabled={loading}
                className="flex-1 h-10 rounded-xl bg-[#2d4a3e] text-white text-sm font-medium disabled:opacity-50"
              >
                {loading ? "Sending…" : "Send Link"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Ledger drawer ────────────────────────────────────────────────────────────

function LedgerDrawer({
  partner,
  onClose,
}: {
  partner: PartnerLoyaltyRecord;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<PartnerLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  useState(() => {
    fetch(`/api/partner-loyalty/ledger?partnerId=${encodeURIComponent(partner.partnerId)}`)
      .then(r => r.json())
      .then(d => { setEntries(d.entries ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  });

  const pageEntries = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(entries.length / PAGE_SIZE);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div>
            <h2 className="text-base font-bold text-gray-900">{partner.companyName} — Point History</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Balance: <strong>{partner.lifetimePoints} pts</strong> · This year: <strong>{partner.currentYearPoints} pts</strong>
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-200 text-gray-500">
            ✕
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">No activity yet</div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                  <tr className="text-xs text-gray-500 text-left">
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Type</th>
                    <th className="px-4 py-2.5 font-medium">Description</th>
                    <th className="px-4 py-2.5 font-medium text-right">Delta</th>
                    <th className="px-4 py-2.5 font-medium text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {pageEntries.map(entry => (
                    <tr
                      key={entry.id}
                      className="border-b border-gray-100"
                      style={
                        entry.pointsDelta > 0
                          ? { background: "#f0fdf4" }
                          : entry.pointsDelta < 0
                          ? { background: "#fef2f2" }
                          : {}
                      }
                    >
                      <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{fmtDate(entry.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {EVENT_LABELS[entry.eventType] ?? entry.eventType}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 text-xs max-w-[200px] truncate">{entry.note || "—"}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums"
                        style={{ color: entry.pointsDelta > 0 ? "#16a34a" : "#dc2626" }}
                      >
                        {entry.pointsDelta > 0 ? "+" : ""}{entry.pointsDelta}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums text-xs">
                        {entry.pointsBalanceAfter}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="border-t border-gray-200 px-6 py-3 flex items-center justify-between bg-gray-50">
                <span className="text-xs text-gray-500">Page {page + 1} of {totalPages}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="text-xs px-3 py-1 rounded-lg border border-gray-300 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page === totalPages - 1}
                    className="text-xs px-3 py-1 rounded-lg border border-gray-300 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

interface Props {
  initialPartners: PartnerLoyaltyRecord[];
  programYearLabel: string;
}

type SortField = "currentYearPoints" | "lifetimePoints" | "currentMultiplier" | "lastUpdated";

export function PartnersAdminClient({ initialPartners, programYearLabel }: Props) {
  const [partners, setPartners] = useState(initialPartners);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("currentYearPoints");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [ledgerPartner, setLedgerPartner] = useState<PartnerLoyaltyRecord | null>(null);
  const [bonusPartner, setBonusPartner] = useState<PartnerLoyaltyRecord | null>(null);
  const [redeemPartner, setRedeemPartner] = useState<PartnerLoyaltyRecord | null>(null);
  const [resetPartner, setResetPartner] = useState<PartnerLoyaltyRecord | null>(null);

  const reload = () => {
    fetch("/api/partner-loyalty/all-partners")
      .then(r => r.json())
      .then(d => setPartners(d.partners ?? []));
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = q
      ? partners.filter(p =>
          p.companyName.toLowerCase().includes(q) ||
          p.partnerName.toLowerCase().includes(q) ||
          p.partnerEmail.toLowerCase().includes(q)
        )
      : [...partners];
    list.sort((a, b) => {
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [partners, search, sortField, sortDir]);

  // Stats
  const totalActive = partners.length;
  const goldPlus = partners.filter(p => ["Gold", "Platinum", "Diamond"].includes(p.currentTier)).length;
  const totalPtsThisYear = partners.reduce((s, p) => s + p.currentYearPoints, 0);
  const diamondCount = partners.filter(p => p.currentTier === "Diamond").length;

  const SortBtn = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => toggleSort(field)}
      className="flex items-center gap-1 text-gray-400 hover:text-gray-200 transition-colors"
    >
      {label}
      <span className="text-[10px]">
        {sortField === field ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
      </span>
    </button>
  );

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Active Partners", value: totalActive },
          { label: "Gold+ Status", value: goldPlus },
          { label: "Total Pts This Year", value: totalPtsThisYear },
          { label: "Diamond Partners", value: diamondCount },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl bg-gray-800 border border-gray-700 px-4 py-4">
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Program year pill */}
      <div className="mb-4">
        <span className="text-xs text-gray-500 bg-gray-800 border border-gray-700 px-3 py-1 rounded-full">
          {programYearLabel}
        </span>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by partner name or company…"
          className="w-full max-w-sm rounded-xl bg-gray-800 border border-gray-700 text-gray-200 placeholder-gray-500 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl bg-gray-800 border border-gray-700 px-6 py-12 text-center text-gray-500 text-sm">
          {partners.length === 0 ? "No partners in the loyalty system yet." : "No partners match your search."}
        </div>
      ) : (
        <div className="rounded-xl bg-gray-800 border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-700">
              <tr className="text-xs text-gray-500 text-left">
                <th className="px-4 py-3 font-medium">Partner / Company</th>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium text-right">
                  <SortBtn field="currentYearPoints" label="This Year" />
                </th>
                <th className="px-4 py-3 font-medium text-right">
                  <SortBtn field="lifetimePoints" label="Lifetime" />
                </th>
                <th className="px-4 py-3 font-medium text-right">
                  <SortBtn field="currentMultiplier" label="Mult." />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortBtn field="lastUpdated" label="Last Activity" />
                </th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(partner => (
                <tr key={partner.id} className="border-b border-gray-700/50 hover:bg-gray-750">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Initials name={partner.companyName || partner.partnerName || "?"} />
                      <div className="min-w-0">
                        <div className="text-gray-200 font-medium text-sm truncate">
                          {partner.companyName || "—"}
                        </div>
                        {partner.partnerName && partner.partnerName !== partner.companyName && (
                          <div className="text-xs text-gray-500 truncate">{partner.partnerName}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <TierBadge tier={partner.currentTier} />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-200 tabular-nums">
                    {partner.currentYearPoints}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 tabular-nums">
                    {partner.lifetimePoints}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400">
                    {partner.currentMultiplier}×
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {fmtDate(partner.lastUpdated)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setLedgerPartner(partner)}
                        className="text-xs px-2 py-1 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                      >
                        Ledger
                      </button>
                      <button
                        onClick={() => setBonusPartner(partner)}
                        className="text-xs px-2 py-1 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                      >
                        Bonus
                      </button>
                      <button
                        onClick={() => setRedeemPartner(partner)}
                        className="text-xs px-2 py-1 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                      >
                        Redeem
                      </button>
                      <button
                        onClick={() => setResetPartner(partner)}
                        className="text-xs px-2 py-1 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                      >
                        ↗ Link
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ledgerPartner && (
        <LedgerDrawer partner={ledgerPartner} onClose={() => setLedgerPartner(null)} />
      )}
      {bonusPartner && (
        <AdjustModal
          partner={bonusPartner}
          type="bonus"
          onClose={() => setBonusPartner(null)}
          onDone={() => { setBonusPartner(null); reload(); }}
        />
      )}
      {redeemPartner && (
        <AdjustModal
          partner={redeemPartner}
          type="redeem"
          onClose={() => setRedeemPartner(null)}
          onDone={() => { setRedeemPartner(null); reload(); }}
        />
      )}
      {resetPartner && (
        <ResetPasswordModal partner={resetPartner} onClose={() => setResetPartner(null)} />
      )}
    </>
  );
}
