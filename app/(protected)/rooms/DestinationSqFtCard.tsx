"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Room, Service } from "@/lib/types";
import { calculateServiceHours } from "@/lib/calculator";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const DESTINATION_SQFT_SERVICES = ["Unpacking", "Setting Up Your Space", "Managing Moving Day"];
const DELTA_SQFT_SERVICES = ["Packing for Donation/Dispersal", "Donating/Dispersal"];
const HIGH_TOUCH_MULTIPLIER = 1.5;

function calcServiceHours(service: Service, rooms: Room[], sourceSqFt: number, destinationSqFt: number): number {
  let base: number;
  if (DESTINATION_SQFT_SERVICES.includes(service.name)) {
    base = Math.round((destinationSqFt / 100) * service.estimatorAvg * 10) / 10;
  } else if (DELTA_SQFT_SERVICES.includes(service.name)) {
    const delta = Math.max(0, sourceSqFt - destinationSqFt);
    base = Math.round((delta / 100) * service.estimatorAvg * 10) / 10;
  } else {
    base = calculateServiceHours(service, rooms);
  }
  return Math.round(base * HIGH_TOUCH_MULTIPLIER * 10) / 10;
}

interface Props {
  tenantId: string;
  rooms: Room[];
  services: Service[];
  initialDestSqFt?: number;
}

export function DestinationSqFtCard({ tenantId, rooms, services, initialDestSqFt }: Props) {
  const [destSqFt, setDestSqFt] = useState(initialDestSqFt ? String(initialDestSqFt) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const sourceSqFt = rooms.reduce((s, r) => s + r.squareFeet, 0);
  const numDest = Number(destSqFt) || 0;
  const activeServices = services.filter(s => s.isActive);
  const serviceRows = activeServices.map(s => ({
    serviceId: s.id,
    serviceName: s.name,
    hours: calcServiceHours(s, rooms, sourceSqFt, numDest),
  })).filter(r => r.hours > 0);
  const totalHours = Math.round(serviceRows.reduce((s, r) => s + r.hours, 0) * 10) / 10;

  async function handleSave() {
    if (!numDest || numDest <= 0) { setError("Enter a valid square footage"); return; }
    setSaving(true); setError(""); setSaved(false);
    try {
      const res = await fetch("/api/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          destinationSqFt: numDest,
          estimatedHours: totalHours,
          estimatedServiceHours: serviceRows,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaved(true);
      router.refresh();
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-8">
      <CardContent>
        <div className="mb-4">
          <h2 className="font-semibold text-gray-900">New Home</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Enter your destination square footage to generate estimated hours by service on your Plan page.
          </p>
        </div>

        <div className="flex items-end gap-3 max-w-xs">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Destination Square Footage
            </label>
            <input
              type="number"
              min="1"
              placeholder="e.g. 1200"
              value={destSqFt}
              onChange={e => { setDestSqFt(e.target.value); setSaved(false); }}
              className={`w-full h-10 px-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-forest-400 ${error ? "border-red-400" : "border-gray-200"}`}
            />
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </div>
          <Button onClick={handleSave} loading={saving} disabled={!destSqFt}>
            {saved ? "Saved" : "Save"}
          </Button>
        </div>

        {totalHours > 0 && (
          <div className="mt-5">
            <p className="text-sm font-medium text-gray-700 mb-2">Estimated Hours by Service</p>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {serviceRows.map((row, i) => (
                    <tr key={row.serviceId} className={i % 2 === 1 ? "bg-gray-50/60" : ""}>
                      <td className="px-4 py-2.5 text-gray-700">{row.serviceName}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{row.hours} hrs</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-forest-200 bg-forest-50">
                    <td className="px-4 py-2.5 font-bold text-forest-700">Total</td>
                    <td className="px-4 py-2.5 text-right font-bold text-forest-700">{totalHours} hrs</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-2">High Touch (×1.5) applied. These hours are saved to your Plan page.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
