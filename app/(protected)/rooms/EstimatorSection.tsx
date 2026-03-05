"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { calculateServiceHours } from "@/lib/calculator";
import type { Tenant, Room, ContractSettings, ContractTemplate, Contract, Service } from "@/lib/types";

// Services whose SqFt input is the destination square footage
const DESTINATION_SQFT_SERVICES = ["Unpacking", "Setting Up Your Space", "Managing Moving Day"];
// Services whose SqFt input is the delta (source total − destination)
const DELTA_SQFT_SERVICES = ["Packing for Donation/Dispersal", "Donating/Dispersal"];

function calcHoursForService(
  service: Service,
  rooms: Room[],
  destinationSqFt: number
): number {
  if (DESTINATION_SQFT_SERVICES.includes(service.name)) {
    return Math.round((destinationSqFt / 100) * service.estimatorAvg * 10) / 10;
  }
  if (DELTA_SQFT_SERVICES.includes(service.name)) {
    const sourceSqFt = rooms.reduce((sum, r) => sum + r.squareFeet, 0);
    const deltaSqFt = Math.max(0, sourceSqFt - destinationSqFt);
    return Math.round((deltaSqFt / 100) * service.estimatorAvg * 10) / 10;
  }
  return calculateServiceHours(service, rooms);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatCost(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function sub(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-yellow-100 text-yellow-800",
  Sent: "bg-blue-100 text-blue-800",
  Signed: "bg-green-100 text-green-800",
};

// ─── Touch level ──────────────────────────────────────────────────────────────
type TouchLevel = "average" | "high" | "very-high";

const TOUCH_OPTIONS: { key: TouchLevel; label: string; sub: string; multiplier: number }[] = [
  { key: "average", label: "Average Touch", sub: "Standard",  multiplier: 1 },
  { key: "high",    label: "High Touch",    sub: "×1.5 hrs",  multiplier: 1.5 },
  { key: "very-high", label: "Very High Touch", sub: "×2 hrs", multiplier: 2 },
];

// ─── Types ────────────────────────────────────────────────────────────────────
type ServiceRow = {
  serviceId: string;
  serviceName: string;
  rate: number;
  calculatedHours: number;
  hours: number;
  included: boolean;
  overridden: boolean;
};

// ─── QBO Invoice Button ───────────────────────────────────────────────────────
function QBOInvoiceButton({ contractId, customerName }: { contractId: string; customerName: string }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleCreate = async () => {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/qbo/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId, customerName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create invoice");
      setMsg(`Invoice #${data.invoice.docNumber} created`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error creating invoice");
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(""), 6000);
    }
  };

  return (
    <span className="flex items-center gap-2">
      <button
        onClick={handleCreate}
        disabled={loading}
        className="text-xs font-medium px-3 py-1 rounded-full border border-[#2CA01C] text-[#2CA01C] hover:bg-green-50 transition-colors disabled:opacity-50"
      >
        {loading ? "Creating…" : "Create QB Invoice"}
      </button>
      {msg && (
        <span className={`text-xs ${msg.startsWith("Invoice") ? "text-green-600" : "text-red-500"}`}>
          {msg}
        </span>
      )}
    </span>
  );
}

interface EstimatorSectionProps {
  tenant: Tenant;
  rooms: Room[];
  settings: ContractSettings | null;
  templates: ContractTemplate[];
  existingContracts: Contract[];
  recipients: { name: string; email: string; role: string }[];
  services: Service[];
}

export function EstimatorSection({
  tenant,
  rooms,
  settings,
  templates,
  existingContracts,
  recipients,
  services,
}: EstimatorSectionProps) {
  const router = useRouter();

  const [destinationSqFt, setDestinationSqFt] = useState(tenant.destinationSqFt ?? 0);
  const [touchLevel, setTouchLevel] = useState<TouchLevel>("average");
  const touchMultiplier = TOUCH_OPTIONS.find((o) => o.key === touchLevel)!.multiplier;
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? "");
  const [contractBody, setContractBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Recipient selection for "Send for Signature"
  const [selectedRecipient, setSelectedRecipient] = useState(recipients[0]?.email ?? "__custom__");
  const [customEmail, setCustomEmail] = useState("");
  const useCustom = selectedRecipient === "__custom__";
  const recipientEmail = useCustom ? customEmail : selectedRecipient;

  // Init on mount + recalc non-overridden rows when rooms, services, destinationSqFt, or touchMultiplier change
  useEffect(() => {
    setRows((prev) => {
      if (prev.length === 0) {
        // Initial population
        return services.filter((s) => s.isActive).map((s) => {
          const calc = calcHoursForService(s, rooms, destinationSqFt);
          const hours = Math.round(calc * touchMultiplier * 10) / 10;
          return {
            serviceId: s.id,
            serviceName: s.name,
            rate: s.hourlyRate,
            calculatedHours: calc,
            hours,
            included: true,
            overridden: false,
          };
        });
      }
      // Recalc non-overridden rows
      return prev.map((row) => {
        if (row.overridden) return row;
        const svc = services.find((s) => s.id === row.serviceId);
        if (!svc) return row;
        const calc = calcHoursForService(svc, rooms, destinationSqFt);
        const hours = Math.round(calc * touchMultiplier * 10) / 10;
        return { ...row, calculatedHours: calc, hours };
      });
    });
  }, [rooms, services, destinationSqFt, touchMultiplier]); // eslint-disable-line react-hooks/exhaustive-deps

  const setRowHours = (serviceId: string, hours: number) => {
    setRows((prev) =>
      prev.map((r) =>
        r.serviceId === serviceId ? { ...r, hours, overridden: hours !== r.calculatedHours } : r
      )
    );
  };

  const resetRow = (serviceId: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.serviceId === serviceId
          ? { ...r, hours: Math.round(r.calculatedHours * touchMultiplier * 10) / 10, overridden: false }
          : r
      )
    );
  };

  const toggleIncluded = (serviceId: string) => {
    setRows((prev) =>
      prev.map((r) => (r.serviceId === serviceId ? { ...r, included: !r.included } : r))
    );
  };

  const resetAll = () => {
    setRows((prev) =>
      prev.map((r) => {
        const svc = services.find((s) => s.id === r.serviceId);
        const calc = svc ? calcHoursForService(svc, rooms, destinationSqFt) : r.calculatedHours;
        const hours = Math.round(calc * touchMultiplier * 10) / 10;
        return { ...r, calculatedHours: calc, hours, overridden: false };
      })
    );
  };

  const anyOverridden = rows.some((r) => r.overridden);

  const totalCost = rows
    .filter((r) => r.included)
    .reduce((sum, r) => sum + r.hours * r.rate, 0);

  const includedLineItems = rows
    .filter((r) => r.included && r.hours > 0)
    .map((r) => ({ serviceId: r.serviceId, serviceName: r.serviceName, hours: r.hours, rate: r.rate }));

  // Keep contract body in sync with selected template + substitutions
  useEffect(() => {
    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) { setContractBody(""); return; }
    const address = [tenant.address, tenant.city, tenant.state, tenant.zip].filter(Boolean).join(", ");
    const totalHours = rows.filter((r) => r.included).reduce((sum, r) => sum + r.hours, 0);
    const serviceList = rows
      .filter((r) => r.included)
      .map((r) => r.serviceName)
      .join(", ");
    setContractBody(
      sub(template.body, {
        clientName: tenant.name,
        projectAddress: address,
        totalCost: formatCost(totalCost),
        signDate: "",
        // Legacy placeholders — map to 0 for new contracts
        rightsizingHours: "0",
        packingHours: "0",
        unpackingHours: "0",
        // New placeholders
        totalHours: String(Math.round(totalHours * 10) / 10),
        serviceList,
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplateId, templates, rows]);

  const buildPostBody = (send: boolean, email?: string, name?: string) => ({
    tenantId: tenant.id,
    templateId: selectedTemplateId,
    contractBody,
    rightsizingHours: 0,
    packingHours: 0,
    unpackingHours: 0,
    rightsizingRate: 0,
    packingRate: 0,
    unpackingRate: 0,
    totalCost,
    lineItems: includedLineItems,
    send,
    recipientEmail: email,
    recipientName: name,
  });

  const handleSaveDraft = async () => {
    setSaving(true); setErrorMsg(""); setSuccessMsg("");
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPostBody(false)),
      });
      if (!res.ok) throw new Error("Failed to save draft");

      await fetch("/api/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant.id, destinationSqFt }),
      });

      setSuccessMsg("Draft saved.");
      router.refresh();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Error saving");
    } finally {
      setSaving(false);
    }
  };

  const handleSendForSignature = async () => {
    if (!recipientEmail.trim()) { setErrorMsg("Enter a recipient email address"); return; }
    setSending(true); setErrorMsg(""); setSuccessMsg("");
    try {
      const recipientName = useCustom
        ? undefined
        : recipients.find((r) => r.email === selectedRecipient)?.name;
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPostBody(true, recipientEmail.trim(), recipientName)),
      });
      if (!res.ok) throw new Error("Failed to send");

      await fetch("/api/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant.id, destinationSqFt }),
      });

      setSuccessMsg("Agreement sent for signature!");
      router.refresh();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Error sending");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-10 border-t border-gray-200 pt-8">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Service Estimator</h2>

      {/* Existing contracts summary */}
      {existingContracts.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Existing Agreements</h3>
          <div className="flex flex-col gap-2">
            {existingContracts.map((c) => (
              <div key={c.id} className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-medium px-3 py-1 rounded-full ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-700"}`}>
                  {c.status} — {formatCost(c.totalCost)} · {new Date(c.createdAt).toLocaleDateString()}
                </span>
                {c.status === "Signed" && (c.lineItems?.length ?? 0) > 0 && (
                  <QBOInvoiceButton contractId={c.id} customerName={tenant.name} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Destination SF */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Destination Square Footage</label>
        <div className="relative w-40">
          <input
            type="number"
            min={0}
            value={destinationSqFt || ""}
            placeholder="0"
            onChange={(e) => setDestinationSqFt(e.target.value === "" ? 0 : Number(e.target.value))}
            className="w-full h-10 px-3 pr-8 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-400"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">SF</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Drives: Unpacking, Setting Up Your Space, Managing Moving Day (dest. SF) and Packing for Donation/Dispersal, Donating/Dispersal (source − dest. delta).
        </p>
      </div>

      {/* Touch level toggle */}
      <div className="mb-8">
        <label className="block text-sm font-medium text-gray-700 mb-2">Touch Level</label>
        <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 gap-1">
          {TOUCH_OPTIONS.map((opt) => {
            const active = touchLevel === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setTouchLevel(opt.key)}
                className={[
                  "flex flex-col items-center px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150 min-w-[120px]",
                  active
                    ? opt.key === "average"
                      ? "bg-white shadow-sm text-forest-700 ring-1 ring-forest-200"
                      : opt.key === "high"
                      ? "bg-amber-50 shadow-sm text-amber-700 ring-1 ring-amber-200"
                      : "bg-orange-50 shadow-sm text-orange-700 ring-1 ring-orange-200"
                    : "text-gray-500 hover:text-gray-700 hover:bg-white/60",
                ].join(" ")}
              >
                <span>{opt.label}</span>
                <span className={["text-xs font-normal mt-0.5", active ? "opacity-80" : "opacity-50"].join(" ")}>
                  {opt.sub}
                </span>
              </button>
            );
          })}
        </div>
        {touchLevel !== "average" && (
          <p className="mt-2 text-xs text-amber-600">
            All auto-calculated hours are multiplied by {touchMultiplier}×. Manually overridden rows are unaffected.
          </p>
        )}
      </div>

      {/* Per-service table */}
      <div className="mb-4">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">No active services found. Add services in the Services settings to build a quote.</p>
        ) : (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-8"></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Service</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Hours</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Rate</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.serviceId} className={`border-b border-gray-100 ${!row.included ? "opacity-50" : ""}`}>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={row.included}
                        onChange={() => toggleIncluded(row.serviceId)}
                        className="rounded border-gray-300 text-forest-600 focus:ring-forest-400"
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <span>{row.serviceName}</span>
                      {row.overridden && (
                        <button
                          onClick={() => resetRow(row.serviceId)}
                          className="ml-2 text-xs text-forest-600 hover:text-forest-700 underline"
                        >
                          Reset
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={row.hours}
                        onChange={(e) => setRowHours(row.serviceId, Number(e.target.value))}
                        className="w-20 h-8 px-2 text-right rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-400"
                      />
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{formatCost(row.rate)}/hr</td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {row.included ? formatCost(row.hours * row.rate) : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="bg-forest-50">
                  <td colSpan={4} className="px-4 py-3 font-bold text-forest-700">Total Estimated Cost</td>
                  <td className="px-4 py-3 text-right font-bold text-forest-700">{formatCost(totalCost)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {anyOverridden && (
          <button onClick={resetAll} className="mt-1.5 text-xs text-forest-600 hover:text-forest-700 underline">
            Reset all to calculated hours
          </button>
        )}
      </div>

      {/* Template selector */}
      {templates.length > 0 && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Contract Template</label>
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            className="h-10 px-3 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-forest-400"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Contract body */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Contract Body</label>
        <textarea
          value={contractBody}
          onChange={(e) => setContractBody(e.target.value)}
          rows={12}
          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-400 resize-y font-mono"
        />
      </div>

      {/* Recipient */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Send Agreement To</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={selectedRecipient}
            onChange={(e) => setSelectedRecipient(e.target.value)}
            className="h-10 px-3 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-forest-400"
          >
            {recipients.map((r) => (
              <option key={r.email} value={r.email}>
                {r.name} ({r.role}) — {r.email}
              </option>
            ))}
            <option value="__custom__">Other — enter email…</option>
          </select>
          {useCustom && (
            <input
              type="email"
              value={customEmail}
              onChange={(e) => setCustomEmail(e.target.value)}
              placeholder="client@example.com"
              className="h-10 px-3 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-400 flex-1"
            />
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleSaveDraft}
          disabled={saving || sending}
          className="h-10 px-5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Draft"}
        </button>
        <button
          onClick={handleSendForSignature}
          disabled={saving || sending || !contractBody.trim()}
          className="h-10 px-5 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send for Signature"}
        </button>
        {successMsg && <span className="text-sm text-green-600 font-medium">{successMsg}</span>}
        {errorMsg && <span className="text-sm text-red-600">{errorMsg}</span>}
      </div>

      {/* Create Invoice shortcut */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <a
          href={`/invoices?tenantId=${tenant.id}`}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-xl border border-forest-300 bg-forest-50 text-sm font-medium text-forest-700 hover:bg-forest-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Create Invoice
        </a>
      </div>
    </div>
  );
}
