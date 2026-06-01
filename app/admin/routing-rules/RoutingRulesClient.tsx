"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AdminHeader } from "../components/AdminHeader";
import type { RoutingRule, LocalVendor, PrimaryRoute, VendorType } from "@/lib/types";

const PRIMARY_ROUTES: PrimaryRoute[] = [
  "Keep", "Family Keeping", "ProFoundFinds Consignment", "FB/Marketplace",
  "Online Marketplace", "Other Consignment", "Estate Sale", "Donate", "Discard",
];

const ROUTE_DISPLAY: Partial<Record<PrimaryRoute, string>> = {
  "Online Marketplace": "eBay",
  "Other Consignment": "Other Consignment Store",
};
const routeLabel = (r: PrimaryRoute) => ROUTE_DISPLAY[r] ?? r;

const VENDOR_TYPES: VendorType[] = [
  "Move Manager", "Mover", "Future Home/Community", "Realtor", "Broker",
  "Donation Org", "Consignment Store", "Junk Hauler", "Attorney", "Other",
];

const MIN_CONDITIONS: RoutingRule["minCondition"][] = [
  "Any", "Fair or better", "Good or better", "Excellent only",
];

const SIZE_OPTIONS = ["Small & Shippable", "Fits in Car-SUV", "Needs Movers"] as const;
const FRAGILITY_OPTIONS = ["Not Fragile", "Somewhat Fragile", "Very Fragile"] as const;

// Default rules to seed — ordered by priority (lower = higher precedence)
const DEFAULT_RULES: Omit<RoutingRule, "id" | "airtableId" | "createdAt">[] = [
  // ── Very Fragile + Needs Movers ──────────────────────────────────────────
  { priority: 5,  matchSizeClasses: "Needs Movers",       matchFragility: "Very Fragile",            minValueMid: 300, maxValueMid: 0,   primaryRoute: "Other Consignment",         vendorType: "Consignment Store", minCondition: "Any", matchCategories: "", isActive: true },
  { priority: 6,  matchSizeClasses: "Needs Movers",       matchFragility: "Very Fragile",            minValueMid: 0,   maxValueMid: 299, primaryRoute: "Donate",                    vendorType: "Donation Org",     minCondition: "Any", matchCategories: "", isActive: true },
  // ── Needs Movers ──────────────────────────────────────────────────────────
  { priority: 10, matchSizeClasses: "Needs Movers",       matchFragility: "",                        minValueMid: 500, maxValueMid: 0,   primaryRoute: "ProFoundFinds Consignment", vendorType: "Consignment Store", minCondition: "Good or better", matchCategories: "", isActive: true },
  { priority: 11, matchSizeClasses: "Needs Movers",       matchFragility: "",                        minValueMid: 300, maxValueMid: 499, primaryRoute: "Other Consignment",         vendorType: "Consignment Store", minCondition: "Good or better", matchCategories: "", isActive: true },
  { priority: 12, matchSizeClasses: "Needs Movers",       matchFragility: "",                        minValueMid: 100, maxValueMid: 299, primaryRoute: "Donate",                    vendorType: "Donation Org",     minCondition: "Any", matchCategories: "", isActive: true },
  { priority: 13, matchSizeClasses: "Needs Movers",       matchFragility: "",                        minValueMid: 0,   maxValueMid: 99,  primaryRoute: "Discard",                   vendorType: "Junk Hauler",      minCondition: "Any", matchCategories: "", isActive: true },
  // ── Very Fragile + Small & Shippable ─────────────────────────────────────
  { priority: 18, matchSizeClasses: "Small & Shippable",  matchFragility: "Very Fragile",            minValueMid: 300, maxValueMid: 0,   primaryRoute: "ProFoundFinds Consignment", vendorType: "Consignment Store", minCondition: "Good or better", matchCategories: "", isActive: true },
  { priority: 19, matchSizeClasses: "Small & Shippable",  matchFragility: "Very Fragile",            minValueMid: 50,  maxValueMid: 299, primaryRoute: "Other Consignment",         vendorType: "Consignment Store", minCondition: "Any", matchCategories: "", isActive: true },
  { priority: 20, matchSizeClasses: "Small & Shippable",  matchFragility: "Very Fragile",            minValueMid: 0,   maxValueMid: 49,  primaryRoute: "Donate",                    vendorType: "Donation Org",     minCondition: "Any", matchCategories: "", isActive: true },
  // ── Very Fragile + Fits in Car-SUV ────────────────────────────────────────
  { priority: 21, matchSizeClasses: "Fits in Car-SUV",    matchFragility: "Very Fragile",            minValueMid: 300, maxValueMid: 0,   primaryRoute: "Other Consignment",         vendorType: "Consignment Store", minCondition: "Good or better", matchCategories: "", isActive: true },
  { priority: 22, matchSizeClasses: "Fits in Car-SUV",    matchFragility: "Very Fragile",            minValueMid: 50,  maxValueMid: 299, primaryRoute: "FB/Marketplace",            vendorType: "Other",            minCondition: "Any", matchCategories: "", isActive: true },
  { priority: 23, matchSizeClasses: "Fits in Car-SUV",    matchFragility: "Very Fragile",            minValueMid: 0,   maxValueMid: 49,  primaryRoute: "Donate",                    vendorType: "Donation Org",     minCondition: "Any", matchCategories: "", isActive: true },
  // ── Small & Shippable + Not/Somewhat Fragile ─────────────────────────────
  { priority: 30, matchSizeClasses: "Small & Shippable",  matchFragility: "Not Fragile,Somewhat Fragile", minValueMid: 100, maxValueMid: 0,   primaryRoute: "Online Marketplace",   vendorType: "Other",            minCondition: "Good or better", matchCategories: "", isActive: true },
  { priority: 31, matchSizeClasses: "Small & Shippable",  matchFragility: "Not Fragile,Somewhat Fragile", minValueMid: 30,  maxValueMid: 99,  primaryRoute: "FB/Marketplace",       vendorType: "Other",            minCondition: "Any", matchCategories: "", isActive: true },
  { priority: 32, matchSizeClasses: "Small & Shippable",  matchFragility: "",                        minValueMid: 0,   maxValueMid: 29,  primaryRoute: "Donate",                    vendorType: "Donation Org",     minCondition: "Any", matchCategories: "", isActive: true },
  // ── Fits in Car-SUV + Not/Somewhat Fragile ────────────────────────────────
  { priority: 40, matchSizeClasses: "Fits in Car-SUV",    matchFragility: "Not Fragile,Somewhat Fragile", minValueMid: 300, maxValueMid: 0,   primaryRoute: "ProFoundFinds Consignment", vendorType: "Consignment Store", minCondition: "Good or better", matchCategories: "", isActive: true },
  { priority: 41, matchSizeClasses: "Fits in Car-SUV",    matchFragility: "Not Fragile,Somewhat Fragile", minValueMid: 75,  maxValueMid: 299, primaryRoute: "FB/Marketplace",        vendorType: "Other",            minCondition: "Any", matchCategories: "", isActive: true },
  { priority: 42, matchSizeClasses: "Fits in Car-SUV",    matchFragility: "",                        minValueMid: 0,   maxValueMid: 74,  primaryRoute: "Donate",                    vendorType: "Donation Org",     minCondition: "Any", matchCategories: "", isActive: true },
];

const ROUTE_COLORS: Record<PrimaryRoute, string> = {
  "Keep":                       "bg-gray-700 text-gray-300",
  "Family Keeping":             "bg-gray-700 text-gray-300",
  "ProFoundFinds Consignment":  "bg-purple-900/60 text-purple-300",
  "FB/Marketplace":             "bg-blue-900/60 text-blue-300",
  "Online Marketplace":         "bg-sky-900/60 text-sky-300",
  "Other Consignment":          "bg-indigo-900/60 text-indigo-300",
  "Donate":                     "bg-teal-900/60 text-teal-300",
  "Discard":                    "bg-red-900/60 text-red-300",
  "Estate Sale":                "bg-amber-900/60 text-amber-300",
};

// ── Checkbox group helper ──────────────────────────────────────────────────────
function CheckboxGroup<T extends string>({
  label, options, value, onChange,
}: {
  label: string;
  options: readonly T[];
  value: string;
  onChange: (v: string) => void;
}) {
  const selected = value ? value.split(",").map(s => s.trim()).filter(Boolean) : [];
  function toggle(opt: T) {
    const next = selected.includes(opt)
      ? selected.filter(s => s !== opt)
      : [...selected, opt];
    onChange(next.join(","));
  }
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">{label} <span className="text-gray-500 font-normal">(blank = any)</span></label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button key={opt} type="button" onClick={() => toggle(opt)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${
              selected.includes(opt)
                ? "bg-forest-700 border-forest-500 text-white"
                : "border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white"
            }`}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Rule Modal ─────────────────────────────────────────────────────────────────
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
  const [matchSizeClasses, setMatchSizeClasses] = useState(rule?.matchSizeClasses ?? "");
  const [matchFragility, setMatchFragility] = useState(rule?.matchFragility ?? "");
  const [minValueMid, setMinValueMid] = useState(rule?.minValueMid ?? 0);
  const [maxValueMid, setMaxValueMid] = useState(rule?.maxValueMid ?? 0);
  const [priority, setPriority] = useState(rule?.priority ?? 50);
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sel = "w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400";
  const inp = "w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400";

  const handleSave = async () => {
    setLoading(true); setError("");
    try {
      const payload = {
        primaryRoute, vendorType, minCondition, matchCategories,
        matchSizeClasses, matchFragility,
        minValueMid: Number(minValueMid) || 0,
        maxValueMid: Number(maxValueMid) || 0,
        priority, isActive,
      };
      const res = await fetch("/api/admin/routing-rules", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { id: rule.id, ...payload } : payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to save");
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!rule) return;
    setLoading(true);
    try {
      await fetch(`/api/admin/routing-rules?id=${rule.id}`, { method: "DELETE" });
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg my-6">
        <div className="px-6 py-5 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{isEdit ? "Edit Rule" : "Add Routing Rule"}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Output */}
          <div className="bg-gray-800/50 rounded-xl p-4 space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Output — what to recommend</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Recommended Route</label>
                <select value={primaryRoute} onChange={e => setPrimaryRoute(e.target.value as PrimaryRoute)} className={sel}>
                  {PRIMARY_ROUTES.map(r => <option key={r} value={r}>{routeLabel(r)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Preferred Vendor Type</label>
                <select value={vendorType} onChange={e => setVendorType(e.target.value as VendorType)} className={sel}>
                  {VENDOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Item conditions */}
          <div className="space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Conditions — when to apply this rule</p>

            <CheckboxGroup label="Size" options={SIZE_OPTIONS} value={matchSizeClasses} onChange={setMatchSizeClasses} />
            <CheckboxGroup label="Fragility" options={FRAGILITY_OPTIONS} value={matchFragility} onChange={setMatchFragility} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Min Target Value ($) <span className="text-gray-500 font-normal">0 = none</span></label>
                <input type="number" min={0} value={minValueMid} onChange={e => setMinValueMid(Number(e.target.value))} className={inp} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Max Target Value ($) <span className="text-gray-500 font-normal">0 = none</span></label>
                <input type="number" min={0} value={maxValueMid} onChange={e => setMaxValueMid(Number(e.target.value))} className={inp} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Min Condition</label>
              <select value={minCondition} onChange={e => setMinCondition(e.target.value as RoutingRule["minCondition"])} className={sel}>
                {MIN_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Match Categories <span className="text-gray-500 font-normal">(comma-separated, blank = all)</span></label>
              <input type="text" value={matchCategories} onChange={e => setMatchCategories(e.target.value)}
                placeholder="Furniture, Art, Jewelry"
                className={inp} />
            </div>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Priority <span className="text-gray-500 font-normal">(lower = runs first)</span></label>
              <input type="number" min={1} value={priority} onChange={e => setPriority(Number(e.target.value))} className={inp} />
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

// ── Rule row summary ───────────────────────────────────────────────────────────
function conditionSummary(rule: RoutingRule): string {
  const parts: string[] = [];
  if (rule.matchSizeClasses) parts.push(rule.matchSizeClasses.split(",").map(s => s.trim()).join(" / "));
  if (rule.matchFragility) parts.push(rule.matchFragility.split(",").map(f => f.trim()).join(" / "));
  if (rule.minValueMid > 0 && rule.maxValueMid > 0) parts.push(`$${rule.minValueMid}–$${rule.maxValueMid}`);
  else if (rule.minValueMid > 0) parts.push(`≥$${rule.minValueMid}`);
  else if (rule.maxValueMid > 0) parts.push(`≤$${rule.maxValueMid}`);
  if (rule.minCondition !== "Any") parts.push(rule.minCondition);
  if (rule.matchCategories) parts.push(rule.matchCategories);
  return parts.length > 0 ? parts.join(" · ") : "All items";
}

// ── Main ──────────────────────────────────────────────────────────────────────
interface Props {
  initialRules: RoutingRule[];
  vendors: LocalVendor[];
}

export function RoutingRulesClient({ initialRules, vendors: _vendors }: Props) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [showModal, setShowModal] = useState(false);
  const [editRule, setEditRule] = useState<RoutingRule | undefined>(undefined);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<string | null>(null);
  const [applyError, setApplyError] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  const openAdd = () => { setEditRule(undefined); setShowModal(true); };
  const openEdit = (r: RoutingRule) => { setEditRule(r); setShowModal(true); };
  const onSaved = () => { setShowModal(false); setEditRule(undefined); router.refresh(); };

  const runAutoRoute = async () => {
    setApplying(true); setApplyResult(null); setApplyError("");
    try {
      const res = await fetch("/api/admin/routing-rules/apply", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setApplyResult(`Updated ${d.assigned} item${d.assigned !== 1 ? "s" : ""}`);
    } catch (e) { setApplyError(e instanceof Error ? e.message : "Error"); }
    finally { setApplying(false); }
  };

  const loadDefaultRules = async () => {
    if (!confirm(`This will create ${DEFAULT_RULES.length} default routing rules. Continue?`)) return;
    setSeeding(true); setSeedResult(null);
    let created = 0;
    for (const rule of DEFAULT_RULES) {
      try {
        await fetch("/api/admin/routing-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rule),
        });
        created++;
      } catch { /* continue */ }
    }
    setSeedResult(`Created ${created} of ${DEFAULT_RULES.length} default rules`);
    setSeeding(false);
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="routing-rules" />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Routing Rules and Skills</h1>
            <p className="text-gray-400 mt-1">{rules.length} rule{rules.length !== 1 ? "s" : ""} · auto-assigns routes and vendors for Pending Review items</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={loadDefaultRules} disabled={seeding}
              className="h-10 px-4 rounded-xl border border-amber-600 text-amber-400 text-sm font-medium hover:bg-amber-900/20 transition-colors disabled:opacity-50">
              {seeding ? "Loading…" : "Load Default Rules"}
            </button>
            <button onClick={runAutoRoute} disabled={applying}
              className="h-10 px-4 rounded-xl border border-forest-600 text-forest-400 text-sm font-medium hover:bg-forest-900/30 transition-colors disabled:opacity-50">
              {applying ? "Running…" : "Run Auto-Route Now"}
            </button>
            <button onClick={openAdd}
              className="h-10 px-4 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Rule
            </button>
          </div>
        </div>

        {/* Hard-constraint notice */}
        <div className="mb-4 p-3 bg-gray-800/60 border border-gray-700 rounded-xl text-xs text-gray-400 space-y-0.5">
          <p className="font-semibold text-gray-300">Hard constraints (always enforced, override all rules):</p>
          <p>· Fits in Car-SUV and Needs Movers items are <span className="text-red-400">never</span> routed to eBay</p>
          <p>· Items in Fair / Poor / For Parts condition are auto-routed to <span className="text-teal-400">Donate</span> (≥$100 target value) or <span className="text-red-400">Discard</span> (&lt;$100)</p>
        </div>

        {applyResult && <div className="mb-4 p-3 bg-green-900/30 border border-green-700 rounded-xl text-sm text-green-400">{applyResult}</div>}
        {applyError && <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-xl text-sm text-red-400">{applyError}</div>}
        {seedResult && <div className="mb-4 p-3 bg-amber-900/30 border border-amber-700 rounded-xl text-sm text-amber-300">{seedResult}</div>}

        {rules.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p>No routing rules yet. Use &quot;Load Default Rules&quot; to get started, or add rules manually.</p>
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider w-12">Pri</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Recommended Route</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Conditions</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Vendor Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider w-16">Active</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule, i) => (
                  <tr key={rule.id} className={`border-b border-gray-800 ${i % 2 === 0 ? "" : "bg-gray-800/20"}`}>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full font-mono">{rule.priority}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROUTE_COLORS[rule.primaryRoute] ?? "bg-gray-700 text-gray-300"}`}>
                        {routeLabel(rule.primaryRoute)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-xs">
                      {conditionSummary(rule)}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell">{rule.vendorType}</td>
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

        {/* Skills Module */}
        <SkillsModule />
      </main>

      {showModal && (
        <RuleModal rule={editRule} onClose={() => setShowModal(false)} onSaved={onSaved} />
      )}
    </div>
  );
}

// ─── Skills Module ────────────────────────────────────────────────────────────
const SKILL_CATEGORIES = ["Physical", "Client-Facing", "Specialty", "Language", "Equipment", "Certification"] as const;
type SkillCategory = typeof SKILL_CATEGORIES[number];

const CATEGORY_COLORS: Record<string, string> = {
  Physical: "bg-orange-900/40 text-orange-300 border border-orange-700/50",
  "Client-Facing": "bg-purple-900/40 text-purple-300 border border-purple-700/50",
  Specialty: "bg-blue-900/40 text-blue-300 border border-blue-700/50",
  Language: "bg-green-900/40 text-green-300 border border-green-700/50",
  Equipment: "bg-yellow-900/40 text-yellow-300 border border-yellow-700/50",
  Certification: "bg-red-900/40 text-red-300 border border-red-700/50",
};
function catColor(cat: string) { return CATEGORY_COLORS[cat] ?? "bg-gray-700 text-gray-300"; }

interface SkillRecord {
  id: string;
  skillName: string;
  skillCategory: string;
  description?: string;
  isActive: boolean;
}

function SkillsModule() {
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ skillName: "", skillCategory: "Physical" as SkillCategory, description: "" });
  const [editForm, setEditForm] = useState<Partial<SkillRecord>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/skills").then(r => r.ok ? r.json() : null).then(data => {
      if (data?.skills) setSkills(data.skills);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!newForm.skillName.trim()) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create skill");
      setSkills(prev => [...prev, data.skill]);
      setNewForm({ skillName: "", skillCategory: "Physical", description: "" });
      setShowNew(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleUpdate() {
    if (!editingId) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/skills/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      setSkills(prev => prev.map(s => s.id === editingId ? data.skill : s));
      setEditingId(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this skill? This cannot be undone.")) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/skills/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      setSkills(prev => prev.filter(s => s.id !== id));
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  function startEdit(s: SkillRecord) {
    setEditingId(s.id);
    setEditForm({ skillName: s.skillName, skillCategory: s.skillCategory, description: s.description ?? "", isActive: s.isActive });
    setShowNew(false);
  }

  const byCategory = SKILL_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = skills.filter(s => s.skillCategory === cat);
    return acc;
  }, {} as Record<string, SkillRecord[]>);
  const uncategorized = skills.filter(s => !SKILL_CATEGORIES.includes(s.skillCategory as SkillCategory));

  return (
    <div className="mt-12 border-t border-gray-800 pt-10">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h2 className="text-xl font-bold text-white">Skills</h2>
          <p className="text-gray-400 text-sm mt-0.5">Define the skill tags available to assign to staff across the platform.</p>
        </div>
        <button
          onClick={() => { setShowNew(true); setEditingId(null); }}
          className="h-9 px-4 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          New Skill
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-xl text-sm text-red-300">{error}</div>}

      {/* New skill form */}
      {showNew && (
        <div className="mb-6 p-4 bg-gray-800/60 border border-gray-700 rounded-xl space-y-3">
          <p className="text-sm font-semibold text-white">New Skill</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Skill Name *</label>
              <input type="text" value={newForm.skillName} onChange={e => setNewForm(f => ({ ...f, skillName: e.target.value }))}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-forest-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Category</label>
              <select value={newForm.skillCategory} onChange={e => setNewForm(f => ({ ...f, skillCategory: e.target.value as SkillCategory }))}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-forest-500">
                {SKILL_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Description (optional)</label>
            <input type="text" value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-forest-500" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleCreate} disabled={saving || !newForm.skillName.trim()}
              className="px-4 py-1.5 bg-forest-600 text-white text-sm rounded-lg hover:bg-forest-700 disabled:opacity-50 transition-colors">
              {saving ? "Creating…" : "Create Skill"}
            </button>
            <button onClick={() => setShowNew(false)} className="px-4 py-1.5 text-gray-400 text-sm rounded-lg hover:text-white transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-gray-500 text-sm py-8 text-center">Loading skills…</div>
      ) : skills.length === 0 ? (
        <div className="text-gray-500 text-sm py-8 text-center">No skills yet. Create your first skill above.</div>
      ) : (
        <div className="space-y-6">
          {([...SKILL_CATEGORIES] as string[]).concat(uncategorized.length ? ["Other"] : []).map(cat => {
            const group = cat === "Other" ? uncategorized : byCategory[cat as SkillCategory] ?? [];
            if (group.length === 0) return null;
            return (
              <div key={cat}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{cat}</p>
                <div className="flex flex-wrap gap-2">
                  {group.map(s => (
                    <div key={s.id}>
                      {editingId === s.id ? (
                        <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3 min-w-[280px] space-y-2">
                          <input type="text" value={editForm.skillName ?? ""} onChange={e => setEditForm(f => ({ ...f, skillName: e.target.value }))}
                            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-forest-500" placeholder="Skill name" />
                          <select value={editForm.skillCategory ?? ""} onChange={e => setEditForm(f => ({ ...f, skillCategory: e.target.value }))}
                            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-forest-500">
                            {SKILL_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                          </select>
                          <input type="text" value={editForm.description ?? ""} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-forest-500" placeholder="Description (optional)" />
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={editForm.isActive ?? true} onChange={e => setEditForm(f => ({ ...f, isActive: e.target.checked }))} className="rounded" />
                            <span className="text-xs text-gray-300">Active</span>
                          </label>
                          <div className="flex gap-2 pt-1">
                            <button onClick={handleUpdate} disabled={saving} className="px-3 py-1 bg-forest-600 text-white text-xs rounded hover:bg-forest-700 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
                            <button onClick={() => setEditingId(null)} className="px-3 py-1 text-gray-400 text-xs hover:text-white">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${catColor(s.skillCategory)} ${!s.isActive ? "opacity-40" : ""}`}>
                          <span>{s.skillName}</span>
                          <button onClick={() => startEdit(s)} className="opacity-60 hover:opacity-100 transition-opacity ml-0.5" title="Edit">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                          <button onClick={() => handleDelete(s.id)} className="opacity-60 hover:opacity-100 transition-opacity" title="Delete">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
