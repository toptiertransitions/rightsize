"use client";

import { useState, useCallback } from "react";
import type { Room, Service, RoomType, DensityLevel } from "@/lib/types";
import { ROOM_TYPES } from "@/lib/types";
import { calculateServiceHours } from "@/lib/calculator";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const DESTINATION_SQFT_SERVICES = ["Unpacking", "Setting Up Your Space", "Managing Moving Day"];
const DELTA_SQFT_SERVICES = ["Packing for Donation/Dispersal", "Donating/Dispersal"];
const HIGH_TOUCH_MULTIPLIER = 1.5;

const DENSITY_DISPLAY: Record<DensityLevel, string> = { Low: "Low", Medium: "Avg", High: "High" };
const DENSITY_DESCRIPTIONS: Record<DensityLevel, string> = {
  Low: "Sparse — minimal furniture",
  Medium: "Typical — normal belongings",
  High: "Full — packed closets",
};

interface LocalRoom {
  localId: string;
  dbId?: string;
  roomType: RoomType;
  squareFeet: number;
  density: DensityLevel;
}

let _counter = 0;
function nextLocalId() { return `lr-${++_counter}`; }

function roomToLocal(r: Room): LocalRoom {
  return { localId: nextLocalId(), dbId: r.id, roomType: r.roomType, squareFeet: r.squareFeet, density: r.density };
}

function calcServiceHours(
  service: Service,
  rooms: LocalRoom[],
  sourceSqFt: number,
  destinationSqFt: number,
): number {
  let base: number;
  if (DESTINATION_SQFT_SERVICES.includes(service.name)) {
    base = Math.round((destinationSqFt / 100) * service.estimatorAvg * 10) / 10;
  } else if (DELTA_SQFT_SERVICES.includes(service.name)) {
    const delta = Math.max(0, sourceSqFt - destinationSqFt);
    base = Math.round((delta / 100) * service.estimatorAvg * 10) / 10;
  } else {
    base = calculateServiceHours(service, rooms.map(r => ({ squareFeet: r.squareFeet, density: r.density })));
  }
  return Math.round(base * HIGH_TOUCH_MULTIPLIER * 10) / 10;
}

interface Props {
  tenantId: string;
  rooms: Room[];
  services: Service[];
  currentEstimatedHours?: number;
  savedDestinationSqFt?: number;
  estimatedServiceHours?: Array<{ serviceId: string; serviceName: string; hours: number }>;
}

export function FreeEstimatorCard({ tenantId, rooms: initialRooms, services, currentEstimatedHours, savedDestinationSqFt, estimatedServiceHours: initialServiceRows }: Props) {
  const [open, setOpen] = useState(false);

  // ── Modal state ──────────────────────────────────────────────────────────────
  const [localRooms, setLocalRooms] = useState<LocalRoom[]>([]);
  const [destSqFt, setDestSqFt] = useState(savedDestinationSqFt ?? 0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function openModal() {
    setLocalRooms(
      initialRooms.length > 0
        ? initialRooms.map(roomToLocal)
        : [{ localId: nextLocalId(), roomType: "Living Room", squareFeet: 200, density: "Medium" }]
    );
    setDestSqFt(savedDestinationSqFt ?? 0);
    setErrors({});
    setSaved(false);
    setOpen(true);
  }

  const addRoom = useCallback(() =>
    setLocalRooms(prev => [...prev, { localId: nextLocalId(), roomType: "Living Room", squareFeet: 200, density: "Medium" }]),
    []);

  const removeRoom = useCallback((localId: string) =>
    setLocalRooms(prev => prev.filter(r => r.localId !== localId)),
    []);

  const updateRoom = useCallback((localId: string, patch: Partial<LocalRoom>) =>
    setLocalRooms(prev => prev.map(r => r.localId === localId ? { ...r, ...patch } : r)),
    []);

  // Live calculation
  const sourceSqFt = localRooms.reduce((s, r) => s + (r.squareFeet || 0), 0);
  const activeServices = services.filter(s => s.isActive);
  const serviceRows = activeServices.map(s => ({
    serviceId: s.id,
    serviceName: s.name,
    hours: calcServiceHours(s, localRooms, sourceSqFt, destSqFt),
  })).filter(r => r.hours > 0);
  const totalHours = Math.round(serviceRows.reduce((s, r) => s + r.hours, 0) * 10) / 10;

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (localRooms.length === 0) errs.rooms = "Add at least one room.";
    localRooms.forEach((r, i) => {
      if (!r.squareFeet || r.squareFeet <= 0) errs[`sf-${i}`] = "Required";
    });
    if (!destSqFt || destSqFt <= 0) errs.dest = "Required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      // Sync rooms: delete removed, patch changed, create new
      const dbRooms = initialRooms;
      const keptDbIds = new Set(localRooms.map(r => r.dbId).filter(Boolean));

      // Delete removed rooms
      await Promise.all(
        dbRooms
          .filter(r => !keptDbIds.has(r.id))
          .map(r => fetch(`/api/rooms?id=${r.id}&tenantId=${tenantId}`, { method: "DELETE" }))
      );

      // Create/update rooms
      await Promise.all(localRooms.map(r => {
        if (r.dbId) {
          return fetch("/api/rooms", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: r.dbId, tenantId, roomType: r.roomType, squareFeet: r.squareFeet, density: r.density, name: r.roomType }),
          });
        } else {
          return fetch("/api/rooms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantId, name: r.roomType, roomType: r.roomType, squareFeet: r.squareFeet, density: r.density }),
          });
        }
      }));

      // Save estimate to tenant
      await fetch("/api/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, estimatedHours: totalHours, estimatedServiceHours: serviceRows, destinationSqFt: destSqFt }),
      });

      setSaved(true);
      setOpen(false);
      // Refresh page to pick up new rooms
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  // ── Card (closed state) ──────────────────────────────────────────────────────
  const hasEstimate = (currentEstimatedHours ?? 0) > 0 || (initialServiceRows?.length ?? 0) > 0;

  return (
    <>
      <div className="mb-2">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Project Estimate</h2>
            <p className="text-sm text-gray-500 mt-0.5">Your hours by service, used to track progress on your Plan.</p>
          </div>
          <Button variant="secondary" onClick={openModal} className="shrink-0">
            {hasEstimate ? "Update Estimate" : "Set Up Estimate"}
          </Button>
        </div>

        {/* Show saved service breakdown if available */}
        {initialServiceRows && initialServiceRows.length > 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {initialServiceRows.map((row, i) => (
                  <tr key={row.serviceId} className={i % 2 === 1 ? "bg-gray-50/60" : ""}>
                    <td className="px-4 py-2.5 text-gray-700">{row.serviceName}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-800 whitespace-nowrap">{row.hours} hrs</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-forest-200 bg-forest-50">
                  <td className="px-4 py-2.5 font-bold text-forest-700">Total</td>
                  <td className="px-4 py-2.5 text-right font-bold text-forest-700 whitespace-nowrap">
                    {(currentEstimatedHours ?? initialServiceRows.reduce((s, r) => s + r.hours, 0))} hrs
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : hasEstimate ? (
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-gray-500">Saved estimate: <span className="font-semibold text-gray-900">{currentEstimatedHours} hrs total</span></p>
              <p className="text-xs text-gray-400 mt-1">Open estimator to see the full service breakdown.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-gray-500">No estimate yet. Click "Set Up Estimate" to enter your rooms and get a service-by-service breakdown.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Modal ─────────────────────────────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-lg font-bold text-gray-900">Update Project Estimate</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto px-6 py-5 space-y-6 flex-1">

              {/* Rooms */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">Current Home Rooms</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Add each room you need to sort through.</p>
                  </div>
                  <span className="text-sm font-semibold text-forest-700">{sourceSqFt.toLocaleString()} SF total</span>
                </div>

                <div className="space-y-3">
                  {localRooms.map((room, idx) => (
                    <div key={room.localId} className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-forest-100 text-forest-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-2">{idx + 1}</span>
                        <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-2">
                          <div className="col-span-2 sm:col-span-1">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Room Type</label>
                            <select
                              value={room.roomType}
                              onChange={e => updateRoom(room.localId, { roomType: e.target.value as RoomType })}
                              className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-forest-500"
                            >
                              {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Sq Ft</label>
                            <input
                              type="number" min="1"
                              value={room.squareFeet || ""}
                              onChange={e => updateRoom(room.localId, { squareFeet: Number(e.target.value) })}
                              className={`w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-forest-500 ${errors[`sf-${idx}`] ? "border-red-400" : "border-gray-300"}`}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Density</label>
                            <div className="flex gap-1">
                              {(["Low", "Medium", "High"] as DensityLevel[]).map(d => (
                                <button
                                  key={d} type="button"
                                  title={DENSITY_DESCRIPTIONS[d]}
                                  onClick={() => updateRoom(room.localId, { density: d })}
                                  className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                                    room.density === d
                                      ? d === "Low" ? "bg-blue-50 border-blue-400 text-blue-700"
                                        : d === "Medium" ? "bg-forest-50 border-forest-400 text-forest-700"
                                        : "bg-orange-50 border-orange-400 text-orange-700"
                                      : "border-gray-300 text-gray-500 hover:border-gray-400"
                                  }`}
                                >
                                  {DENSITY_DISPLAY[d]}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        {localRooms.length > 1 && (
                          <button
                            type="button" onClick={() => removeRoom(room.localId)}
                            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 mt-5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {errors.rooms && <p className="mt-2 text-xs text-red-600">{errors.rooms}</p>}
                <button
                  type="button" onClick={addRoom}
                  className="mt-3 w-full flex items-center justify-center gap-2 py-2 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-forest-400 hover:text-forest-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Room
                </button>
              </section>

              {/* Destination */}
              <section>
                <h3 className="font-semibold text-gray-900 mb-1">New Home</h3>
                <p className="text-xs text-gray-500 mb-3">Affects unpacking & setup estimates.</p>
                <div className="max-w-xs">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Square Footage</label>
                  <input
                    type="number" min="1" placeholder="1200"
                    value={destSqFt || ""}
                    onChange={e => setDestSqFt(Number(e.target.value))}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-forest-500 ${errors.dest ? "border-red-400" : "border-gray-300"}`}
                  />
                  {errors.dest && <p className="mt-1 text-xs text-red-600">{errors.dest}</p>}
                </div>
              </section>

              {/* Live breakdown */}
              {totalHours > 0 && (
                <section>
                  <h3 className="font-semibold text-gray-900 mb-3">Estimated Hours by Service</h3>
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
                  <p className="text-xs text-gray-400 mt-2">High Touch (×1.5) applied. This will be saved to your Plan page.</p>
                </section>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 shrink-0">
              <Button onClick={handleSave} disabled={saving || totalHours === 0} className="w-full">
                {saving ? "Saving…" : "Save to Plan"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
