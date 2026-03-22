"use client";

import { useState } from "react";
import type { Room, Service } from "@/lib/types";
import { calculateServiceHours } from "@/lib/calculator";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

// Must match EstimatorSection exactly
const DESTINATION_SQFT_SERVICES = ["Unpacking", "Setting Up Your Space", "Managing Moving Day"];
const DELTA_SQFT_SERVICES = ["Packing for Donation/Dispersal", "Donating/Dispersal"];
const HIGH_TOUCH_MULTIPLIER = 1.5;

interface Props {
  tenantId: string;
  rooms: Room[];
  services: Service[];
  currentEstimatedHours?: number;
  savedDestinationSqFt?: number;
}

function calcTotalHours(
  services: Service[],
  currentSqFt: number,
  destinationSqFt: number,
): { rows: { name: string; hours: number }[]; total: number } {
  const syntheticRoom = currentSqFt > 0
    ? [{ id: "syn", airtableId: "", tenantId: "", name: "Home", roomType: "Other" as const, squareFeet: currentSqFt, density: "High" as const, createdAt: "" }]
    : [];

  const rows = services.filter((s) => s.isActive).map((s) => {
    let base: number;
    if (DESTINATION_SQFT_SERVICES.includes(s.name)) {
      base = Math.round((destinationSqFt / 100) * s.estimatorAvg * 10) / 10;
    } else if (DELTA_SQFT_SERVICES.includes(s.name)) {
      const delta = Math.max(0, currentSqFt - destinationSqFt);
      base = Math.round((delta / 100) * s.estimatorAvg * 10) / 10;
    } else {
      base = calculateServiceHours(s, syntheticRoom);
    }
    const hours = Math.round(base * HIGH_TOUCH_MULTIPLIER * 10) / 10;
    return { name: s.name, hours };
  });

  const total = Math.round(rows.reduce((sum, r) => sum + r.hours, 0) * 10) / 10;
  return { rows, total };
}

export function FreeEstimatorCard({ tenantId, rooms, services, currentEstimatedHours, savedDestinationSqFt }: Props) {
  const [open, setOpen] = useState(false);
  const [currentSqFt, setCurrentSqFt] = useState(0);
  const [destinationSqFt, setDestinationSqFt] = useState(savedDestinationSqFt ?? 0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { rows: serviceRows, total: totalHours } = calcTotalHours(services, currentSqFt, destinationSqFt);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, estimatedHours: totalHours }),
      });
      setSaved(true);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card hover onClick={() => setOpen(true)} className="cursor-pointer">
        <CardContent className="py-5">
          <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center mb-2">
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-900">Free Estimate</p>
          {currentEstimatedHours && !saved ? (
            <p className="text-xs text-gray-500 mt-0.5">
              Saved: {currentEstimatedHours}h total &mdash;{" "}
              <span className="text-blue-600 font-medium">Recalculate</span>
            </p>
          ) : saved ? (
            <p className="text-xs text-green-600 mt-0.5">Estimate saved</p>
          ) : (
            <p className="text-xs text-gray-500 mt-0.5">Estimate your project hours</p>
          )}
          <p className="text-xs text-blue-600 mt-2 font-medium">Open estimator →</p>
        </CardContent>
      </Card>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Project Estimate</h2>

            {/* Rooms summary */}
            {rooms.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Rooms ({rooms.length})</p>
                <p className="text-sm text-gray-700">
                  {rooms.map(r => r.name).join(", ")}
                </p>
              </div>
            )}

            {/* Current home sq ft */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Home (sq ft)
              </label>
              <input
                type="number"
                min={0}
                value={currentSqFt || ""}
                placeholder="0"
                onChange={e => setCurrentSqFt(Number(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-forest-500"
              />
            </div>

            {/* Destination sq ft */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Destination (sq ft)
              </label>
              <input
                type="number"
                min={0}
                value={destinationSqFt || ""}
                placeholder="0"
                onChange={e => setDestinationSqFt(Number(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-forest-500"
              />
            </div>

            {/* Results table */}
            {(currentSqFt > 0 || destinationSqFt > 0) && serviceRows.length > 0 && (
              <div className="rounded-xl border border-gray-200 overflow-hidden mb-5">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Service</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serviceRows.map((row) => (
                      <tr key={row.name} className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-700">{row.name}</td>
                        <td className="px-3 py-2 text-right text-gray-900">{row.hours}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-forest-200 bg-forest-50">
                      <td className="px-3 py-2 font-bold text-forest-700">Total</td>
                      <td className="px-3 py-2 text-right font-bold text-forest-700">{totalHours}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <Button
              onClick={handleSave}
              disabled={saving || totalHours === 0}
              className="w-full"
            >
              {saving ? "Saving…" : "Save to Plan"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
