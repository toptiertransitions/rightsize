"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { runCalculator } from "@/lib/calculator";
import type { Tenant, Room, ContractSettings, ContractTemplate, Contract } from "@/lib/types";

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

interface EstimatorSectionProps {
  tenant: Tenant;
  rooms: Room[];
  settings: ContractSettings | null;
  templates: ContractTemplate[];
  existingContracts: Contract[];
}

export function EstimatorSection({
  tenant,
  rooms,
  settings,
  templates,
  existingContracts,
}: EstimatorSectionProps) {
  const router = useRouter();

  const [destinationSqFt, setDestinationSqFt] = useState(tenant.destinationSqFt ?? 0);
  const [rightsizingHours, setRightsizingHours] = useState(0);
  const [packingHours, setPackingHours] = useState(0);
  const [unpackingHours, setUnpackingHours] = useState(0);
  const [hoursOverridden, setHoursOverridden] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? "");
  const [contractBody, setContractBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const calcHours = useCallback(() => {
    const result = runCalculator({
      rooms: rooms.map((r) => ({
        id: r.id,
        name: r.name,
        roomType: r.roomType,
        squareFeet: r.squareFeet,
        density: r.density,
      })),
      destinationSqFt,
      helperType: "TTT",
    });
    return result;
  }, [rooms, destinationSqFt]);

  // Auto-calc on mount and when rooms/destinationSqFt change (unless manually overridden)
  useEffect(() => {
    if (hoursOverridden) return;
    const result = calcHours();
    setRightsizingHours(result.rightsizingHours);
    setPackingHours(result.packingHours);
    setUnpackingHours(result.unpackingHours);
  }, [hoursOverridden, calcHours]);

  const resetToCalculated = () => {
    setHoursOverridden(false);
    const result = calcHours();
    setRightsizingHours(result.rightsizingHours);
    setPackingHours(result.packingHours);
    setUnpackingHours(result.unpackingHours);
  };

  // Keep contract body in sync with selected template + substitutions
  useEffect(() => {
    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) { setContractBody(""); return; }
    const address = [tenant.address, tenant.city, tenant.state, tenant.zip].filter(Boolean).join(", ");
    setContractBody(
      sub(template.body, {
        clientName: tenant.name,
        projectAddress: address,
        totalCost: formatCost(totalCost),
        signDate: "",
        rightsizingHours: String(rightsizingHours),
        packingHours: String(packingHours),
        unpackingHours: String(unpackingHours),
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplateId, templates, rightsizingHours, packingHours, unpackingHours]);

  const rRate = settings?.rightsizingRate ?? 0;
  const pRate = settings?.packingRate ?? 0;
  const uRate = settings?.unpackingRate ?? 0;
  const totalCost =
    rightsizingHours * rRate + packingHours * pRate + unpackingHours * uRate;

  const phases = [
    { label: "Rightsizing", hours: rightsizingHours, setHours: setRightsizingHours, rate: rRate },
    { label: "Packing", hours: packingHours, setHours: setPackingHours, rate: pRate },
    { label: "Unpacking", hours: unpackingHours, setHours: setUnpackingHours, rate: uRate },
  ];

  const handleSaveDraft = async () => {
    setSaving(true); setErrorMsg(""); setSuccessMsg("");
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant.id,
          templateId: selectedTemplateId,
          contractBody,
          rightsizingHours,
          packingHours,
          unpackingHours,
          rightsizingRate: rRate,
          packingRate: pRate,
          unpackingRate: uRate,
          totalCost,
          send: false,
        }),
      });
      if (!res.ok) throw new Error("Failed to save draft");

      // Save destinationSqFt on tenant
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
    setSending(true); setErrorMsg(""); setSuccessMsg("");
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant.id,
          templateId: selectedTemplateId,
          contractBody,
          rightsizingHours,
          packingHours,
          unpackingHours,
          rightsizingRate: rRate,
          packingRate: pRate,
          unpackingRate: uRate,
          totalCost,
          send: true,
        }),
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
          <div className="flex flex-wrap gap-2">
            {existingContracts.map((c) => (
              <span key={c.id} className={`text-xs font-medium px-3 py-1 rounded-full ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-700"}`}>
                {c.status} — {formatCost(c.totalCost)} · {new Date(c.createdAt).toLocaleDateString()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Destination SF */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Destination Square Footage</label>
        <input
          type="number"
          min={0}
          value={destinationSqFt}
          onChange={(e) => {
            setDestinationSqFt(Number(e.target.value));
            setHoursOverridden(false);
          }}
          className="w-40 h-10 px-3 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-400"
        />
      </div>

      {/* Phase table */}
      <div className="mb-4">
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Phase</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Hours</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Rate</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Cost</th>
              </tr>
            </thead>
            <tbody>
              {phases.map(({ label, hours, setHours, rate }) => (
                <tr key={label} className="border-b border-gray-100">
                  <td className="px-4 py-3 text-gray-700">{label}</td>
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={hours}
                      onChange={(e) => {
                        setHours(Number(e.target.value));
                        setHoursOverridden(true);
                      }}
                      className="w-20 h-8 px-2 text-right rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-400"
                    />
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{formatCost(rate)}/hr</td>
                  <td className="px-4 py-3 text-right text-gray-900">{formatCost(hours * rate)}</td>
                </tr>
              ))}
              <tr className="bg-forest-50">
                <td className="px-4 py-3 font-bold text-forest-700" colSpan={3}>Total Estimated Cost</td>
                <td className="px-4 py-3 text-right font-bold text-forest-700">{formatCost(totalCost)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {hoursOverridden && (
          <button onClick={resetToCalculated} className="mt-1.5 text-xs text-forest-600 hover:text-forest-700 underline">
            Reset to calculated hours
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

      {/* Actions */}
      <div className="flex items-center gap-3">
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
    </div>
  );
}
