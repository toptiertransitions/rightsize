"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardContent } from "@/components/ui/Card";
import { calculateServiceHours } from "@/lib/calculator";
import { CALCULATOR_CONFIG } from "@/lib/config";
import { ROOM_TYPES } from "@/lib/types";
import type {
  CalculatorRoom,
  DensityLevel,
  HelperType,
  RoomType,
  Service,
  ServiceCalcResult,
} from "@/lib/types";
import { CalculatorResults } from "./CalculatorResults";

// Must stay in sync with EstimatorSection / FreeEstimatorCard
const DESTINATION_SQFT_SERVICES = ["Unpacking", "Setting Up Your Space", "Managing Moving Day"];
const DELTA_SQFT_SERVICES = ["Packing for Donation/Dispersal", "Donating/Dispersal"];
const HIGH_TOUCH_MULTIPLIER = 1.5;

let roomIdCounter = 0;
const newRoom = (): CalculatorRoom => ({
  id: `room-${++roomIdCounter}`,
  name: "",
  roomType: "Living Room",
  squareFeet: 200,
  density: "Medium",
});

const DENSITY_DESCRIPTIONS: Record<DensityLevel, string> = {
  Low: "Sparse — easy to navigate, minimal furniture",
  Medium: "Typical — normal amount of furniture & belongings",
  High: "Full — packed closets, lots of items to sort",
};

const DENSITY_DISPLAY: Record<DensityLevel, string> = {
  Low: "Low",
  Medium: "Average",
  High: "High",
};

const HELPER_OPTIONS: Array<{ value: HelperType; label: string; desc: string }> = [
  { value: "Solo",   label: "Solo",     desc: "Working alone (10 hrs/wk)" },
  { value: "Family", label: "Family",   desc: "You + family members (20 hrs/wk)" },
  { value: "Mixed",  label: "Mixed",    desc: "Family + hired help (35 hrs/wk)" },
  { value: "TTT",    label: "TTT Team", desc: "Top Tier Transitions crew (50 hrs/wk)" },
];

function calcServiceHours(
  service: Service,
  rooms: CalculatorRoom[],
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
    base = calculateServiceHours(service, rooms);
  }
  return Math.round(base * HIGH_TOUCH_MULTIPLIER * 10) / 10;
}

interface Props {
  services: Service[];
}

export function CalculatorForm({ services }: Props) {
  const [rooms, setRooms] = useState<CalculatorRoom[]>([newRoom()]);
  const [destinationSqFt, setDestinationSqFt] = useState<string>("1200");
  const [helperType, setHelperType] = useState<HelperType>("Mixed");
  const [result, setResult] = useState<ServiceCalcResult | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const addRoom = useCallback(() => setRooms(prev => [...prev, newRoom()]), []);
  const removeRoom = useCallback((id: string) => setRooms(prev => prev.filter(r => r.id !== id)), []);
  const updateRoom = useCallback(
    (id: string, updates: Partial<CalculatorRoom>) =>
      setRooms(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r)),
    []
  );

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (rooms.length === 0) errs.rooms = "Add at least one room.";
    rooms.forEach((r, i) => {
      if (!r.name.trim()) errs[`room-name-${i}`] = "Room name required";
      if (!r.squareFeet || r.squareFeet <= 0) errs[`room-sf-${i}`] = "Enter square footage";
    });
    const destSf = Number(destinationSqFt);
    if (!destSf || destSf <= 0) errs.destination = "Enter destination SF";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCalculate = () => {
    if (!validate()) return;

    const destSf = Number(destinationSqFt);
    const sourceSqFt = rooms.reduce((sum, r) => sum + (r.squareFeet || 0), 0);
    const activeServices = services.filter(s => s.isActive);

    const serviceRows = activeServices.map(s => ({
      serviceId: s.id,
      serviceName: s.name,
      hours: calcServiceHours(s, rooms, sourceSqFt, destSf),
    })).filter(r => r.hours > 0);

    const totalHours = Math.round(serviceRows.reduce((sum, r) => sum + r.hours, 0) * 10) / 10;
    const hoursPerWeek = CALCULATOR_CONFIG.helperHoursPerWeek[helperType];
    const estimatedWeeks = Math.ceil(totalHours / hoursPerWeek);

    setResult({ serviceRows, totalHours, estimatedWeeks, helperType });
    setTimeout(() => {
      document.getElementById("calculator-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const totalSourceSqFt = rooms.reduce((sum, r) => sum + (r.squareFeet || 0), 0);

  return (
    <div className="space-y-8">
      {/* Source Rooms */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Current Home Rooms</h2>
            <p className="text-sm text-gray-500 mt-0.5">Add each room you need to sort through.</p>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-forest-700">{totalSourceSqFt.toLocaleString()} SF</div>
            <div className="text-xs text-gray-400">total</div>
          </div>
        </div>

        <div className="space-y-3">
          {rooms.map((room, index) => (
            <Card key={room.id}>
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-forest-50 border border-forest-200 flex items-center justify-center text-xs font-bold text-forest-700 mt-2">
                    {index + 1}
                  </div>

                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-3">
                      <Input
                        label="Room Name"
                        placeholder="e.g. Master Bedroom"
                        value={room.name}
                        onChange={e => updateRoom(room.id, { name: e.target.value })}
                        error={errors[`room-name-${index}`]}
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <Select
                        label="Room Type"
                        value={room.roomType}
                        onChange={e => updateRoom(room.id, { roomType: e.target.value as RoomType })}
                        options={ROOM_TYPES.map(t => ({ value: t, label: t }))}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Input
                        label="Square Feet"
                        type="number"
                        min="1"
                        placeholder="200"
                        value={room.squareFeet || ""}
                        onChange={e => updateRoom(room.id, { squareFeet: Number(e.target.value) })}
                        error={errors[`room-sf-${index}`]}
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Density</label>
                      <div className="flex gap-2">
                        {(["Low", "Medium", "High"] as DensityLevel[]).map(d => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => updateRoom(room.id, { density: d })}
                            title={DENSITY_DESCRIPTIONS[d]}
                            className={`flex-1 h-12 rounded-xl border text-sm font-medium transition-all ${
                              room.density === d
                                ? d === "Low"
                                  ? "bg-blue-50 border-blue-400 text-blue-700"
                                  : d === "Medium"
                                  ? "bg-forest-50 border-forest-400 text-forest-700"
                                  : "bg-orange-50 border-orange-400 text-orange-700"
                                : "border-gray-300 text-gray-500 hover:border-gray-400"
                            }`}
                          >
                            {DENSITY_DISPLAY[d]}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-gray-400">{DENSITY_DESCRIPTIONS[room.density]}</p>
                    </div>
                  </div>

                  {rooms.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRoom(room.id)}
                      className="flex-shrink-0 mt-8 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      aria-label="Remove room"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {errors.rooms && <p className="mt-2 text-sm text-red-600">{errors.rooms}</p>}

        <Button type="button" variant="secondary" onClick={addRoom} className="mt-3 w-full">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Room
        </Button>
      </section>

      {/* Destination */}
      <section className="bg-white rounded-2xl border border-cream-200 shadow-sm p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-1">New Home</h2>
        <p className="text-sm text-gray-500 mb-5">
          Where are you moving to? This affects unpacking & setup time.
        </p>
        <div className="max-w-xs">
          <Input
            label="Destination Square Feet"
            type="number"
            min="1"
            placeholder="1200"
            value={destinationSqFt}
            onChange={e => setDestinationSqFt(e.target.value)}
            error={errors.destination}
            hint="The approximate SF of your new home"
          />
        </div>
      </section>

      {/* Helper Type */}
      <section className="bg-white rounded-2xl border border-cream-200 shadow-sm p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Who&apos;s Helping?</h2>
        <p className="text-sm text-gray-500 mb-5">Determines your estimated timeline.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {HELPER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setHelperType(opt.value)}
              className={`p-4 rounded-2xl border-2 text-left transition-all ${
                helperType === opt.value ? "border-forest-500 bg-forest-50" : "border-gray-200 hover:border-forest-300"
              }`}
            >
              <div className="font-semibold text-sm text-gray-900">{opt.label}</div>
              <div className="text-xs text-gray-500 mt-1 leading-snug">{opt.desc}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Calculate Button */}
      <Button size="lg" onClick={handleCalculate} className="w-full">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        Calculate My Timeline
      </Button>

      {/* Results */}
      {result && (
        <div id="calculator-results">
          <CalculatorResults result={result} />
        </div>
      )}
    </div>
  );
}
