"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import type { RoutingRule, LocalVendor, PrimaryRoute, VendorType } from "@/lib/types";

const PRIMARY_ROUTES: PrimaryRoute[] = [
  "Keep", "Family Keeping", "ProFoundFinds Consignment", "FB/Marketplace",
  "Online Marketplace", "Other Consignment", "Donate", "Discard",
];

const VENDOR_TYPES: VendorType[] = [
  "Move Manager", "Mover", "Future Home/Community", "Realtor", "Broker",
  "Donation Org", "Consignment Store", "Junk Hauler", "Attorney", "Other",
];

const MIN_CONDITIONS: RoutingRule["minCondition"][] = [
  "Any", "Fair or better", "Good or better", "Excellent only",
];

interface RuleModalProps {
  rule?: RoutingRule;
  onClose: () => void;
  onSaved: () => void;
}

function RuleModal({ rule, onClose, onSaved }: RuleModalProps) {
  const isEdit = !!rule;
  const [primaryRoute, setPrimaryRoute] = useState<PrimaryRoute>(rule?.primaryRoute ?? "Donate");
  const [vendorType, setVendorType] = useState<VendorType>(rule?.vendorType ?? "Donation Org");
  const [minCondition, setMinCondition] = useState<RoutingRule["minCondition"]>(rule?.minCondition ?? "Any");
  const [matchCategories, setMatchCategories] = useState(rule?.matchCategories ?? "");
  const [priority, setPriority] = useState(rule?.priority ?? 10);
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setLoading(true);
    setError("");
    try {
      const payload = { primaryRoute, vendorType, minCondition, matchCategories, priority, isActive };
      const res = await fetch("/api/admin/routing-rules", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { id: rule.id, ...payload } : payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!rule) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/routing-rules?id=${rule.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{isEdit ? "Edit Rule" : "Add Routing Rule"}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Primary Route</label>
            <select value={primaryRoute} onChange={e => setPrimaryRoute(e.target.value as PrimaryRoute)}
              className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400">
              {PRIMARY_ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Vendor Type</label>
            <select value={vendorType} onChange={e => setVendorType(e.target.value as VendorType)}
              className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400">
              {VENDOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Min Condition</label>
            <select value={minCondition} onChange={e => setMinCondition(e.target.value as RoutingRule["minCondition"])}
              className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400">
              {MIN_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Match Categories (comma-separated, blank = all)</label>
            <input type="text" value={matchCategories} onChange={e => setMatchCategories(e.target.value)}
              placeholder="Furniture, Art, Jewelry"
              className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Priority (lower = higher)</label>
              <input type="number" min={1} value={priority} onChange={e => setPriority(Number(e.target.value))}
                className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400" />
            </div>
            <div className="flex items-end pb-1">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setIsActive(!isActive)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isActive ? "bg-forest-600" : "bg-gray-600"}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isActive ? "translate-x-6" : "translate-x-1"}`} />
                </button>
                <span className="text-sm text-gray-300">Active</span>
              </div>
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="px-6 py-4 flex gap-3 border-t border-gray-700">
          {isEdit && (
            <button onClick={handleDelete} disabled={loading}
              className="h-10 px-4 rounded-xl border border-red-700 text-red-400 text-sm font-medium hover:bg-red-900/30 transition-colors disabled:opacity-50">
              Delete
            </button>
          )}
          <button onClick={onClose} disabled={loading}
            className="flex-1 h-10 rounded-xl border border-gray-600 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={loading}
            className="flex-1 h-10 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors disabled:opacity-50">
            {loading ? "Saving…" : isEdit ? "Save" : "Add Rule"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  initialRules: RoutingRule[];
  vendors: LocalVendor[];
}

export function RoutingRulesClient({ initialRules, vendors: _vendors }: Props) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [editRule, setEditRule] = useState<RoutingRule | undefined>(undefined);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<string | null>(null);
  const [applyError, setApplyError] = useState("");

  const openAdd = () => { setEditRule(undefined); setShowModal(true); };
  const openEdit = (r: RoutingRule) => { setEditRule(r); setShowModal(true); };
  const onSaved = () => { setShowModal(false); setEditRule(undefined); router.refresh(); };

  const runAutoRoute = async () => {
    setApplying(true);
    setApplyResult(null);
    setApplyError("");
    try {
      const res = await fetch("/api/admin/routing-rules/apply", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setApplyResult(`Assigned ${d.assigned} item${d.assigned !== 1 ? "s" : ""}`);
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : "Error");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-900">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-forest-600 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <div>
                <div className="font-bold text-white text-sm">Rightsize</div>
                <div className="text-[9px] text-gray-400">TTT Admin Console</div>
              </div>
            </div>
            <nav className="hidden md:flex items-center gap-1">
              <Link href="/admin" className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">Projects</Link>
              <Link href="/admin/users" className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">Users</Link>
              <Link href="/admin/local-vendors" className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">Local Vendors</Link>
              <Link href="/admin/routing-rules" className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-white font-medium">Routing Rules</Link>
              <Link href="/admin/integrations/circle-hand" className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">Circle Hand</Link>
              <Link href="/admin/contract-services" className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">Contract & Services</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-red-900/50 text-red-400 border border-red-800 px-3 py-1 rounded-full font-medium">
              Admin
            </span>
            <UserButton afterSignOutUrl="/sign-in" />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Routing Rules</h1>
            <p className="text-gray-400 mt-1">{initialRules.length} rule{initialRules.length !== 1 ? "s" : ""} · auto-assigns items to local vendors</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={runAutoRoute}
              disabled={applying}
              className="h-10 px-4 rounded-xl border border-forest-600 text-forest-400 text-sm font-medium hover:bg-forest-900/30 transition-colors disabled:opacity-50"
            >
              {applying ? "Running…" : "Run Auto-Route Now"}
            </button>
            <button
              onClick={openAdd}
              className="h-10 px-4 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Rule
            </button>
          </div>
        </div>

        {applyResult && (
          <div className="mb-4 p-3 bg-green-900/30 border border-green-700 rounded-xl text-sm text-green-400">{applyResult}</div>
        )}
        {applyError && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-xl text-sm text-red-400">{applyError}</div>
        )}

        {initialRules.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p>No routing rules yet. Add one to start auto-assigning items to vendors.</p>
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Primary Route</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Vendor Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Min Condition</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Match Categories</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Active</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {initialRules.map((rule, i) => (
                  <tr key={rule.id} className={`border-b border-gray-800 ${i % 2 === 0 ? "" : "bg-gray-800/20"}`}>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full font-mono">{rule.priority}</span>
                    </td>
                    <td className="px-4 py-3 text-white font-medium">{rule.primaryRoute}</td>
                    <td className="px-4 py-3 text-gray-300">{rule.vendorType}</td>
                    <td className="px-4 py-3 text-gray-400">{rule.minCondition}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {rule.matchCategories ? (
                        <span className="truncate block max-w-[180px]" title={rule.matchCategories}>{rule.matchCategories}</span>
                      ) : <span className="text-gray-600">All categories</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block w-2 h-2 rounded-full ${rule.isActive ? "bg-green-400" : "bg-gray-600"}`} />
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEdit(rule)}
                        className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded-lg hover:bg-gray-700 transition-colors">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {showModal && (
        <RuleModal rule={editRule} onClose={() => setShowModal(false)} onSaved={onSaved} />
      )}
    </div>
  );
}
