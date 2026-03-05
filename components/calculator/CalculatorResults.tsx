"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { formatNumber } from "@/lib/utils";
import type { CalculatorResult, DensityLevel } from "@/lib/types";
import { CALCULATOR_CONFIG } from "@/lib/config";

interface CalculatorResultsProps {
  result: CalculatorResult;
}

const DENSITY_LABELS: Record<DensityLevel, { label: string; color: string }> = {
  Low: { label: "Low", color: "text-blue-600" },
  Medium: { label: "Average", color: "text-forest-600" },
  High: { label: "High", color: "text-orange-600" },
};

export function CalculatorResults({ result }: CalculatorResultsProps) {
  const { rightsizingHours, packingHours, unpackingHours, totalHours, estimatedWeeks, helperType, roomBreakdown } = result;
  const hoursPerWeek = CALCULATOR_CONFIG.helperHoursPerWeek[helperType];

  const stats = [
    {
      label: "Rightsizing",
      value: formatNumber(rightsizingHours),
      unit: "hrs",
      desc: "Sort, decide, declutter",
      color: "text-forest-700",
      bg: "bg-forest-50 border-forest-200",
    },
    {
      label: "Packing",
      value: formatNumber(packingHours),
      unit: "hrs",
      desc: "Box up belongings",
      color: "text-blue-700",
      bg: "bg-blue-50 border-blue-200",
    },
    {
      label: "Unpacking",
      value: formatNumber(unpackingHours),
      unit: "hrs",
      desc: "Settle into new home",
      color: "text-purple-700",
      bg: "bg-purple-50 border-purple-200",
    },
  ];

  return (
    <div className="space-y-6 pt-4">
      {/* Headline */}
      <div className="bg-forest-600 text-white rounded-2xl p-6 text-center shadow-lg">
        <p className="text-forest-200 text-sm font-medium mb-1">Estimated Total</p>
        <div className="text-5xl font-bold mb-2">
          {formatNumber(totalHours, 0)}{" "}
          <span className="text-3xl font-normal text-forest-200">hours</span>
        </div>
        <div className="text-forest-100 text-lg">
          ≈{" "}
          <span className="font-bold text-white">
            {estimatedWeeks} week{estimatedWeeks !== 1 ? "s" : ""}
          </span>{" "}
          with {helperType} help ({hoursPerWeek} hrs/wk)
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`rounded-2xl border p-4 text-center ${s.bg}`}
          >
            <div className={`text-2xl font-bold ${s.color}`}>
              {s.value}
              <span className="text-sm font-normal ml-0.5">{s.unit}</span>
            </div>
            <div className="font-semibold text-sm text-gray-700 mt-0.5">
              {s.label}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{s.desc}</div>
          </div>
        ))}
      </div>

      {/* Room Breakdown */}
      <Card>
        <CardContent>
          <h3 className="font-semibold text-gray-900 mb-4">Room Breakdown</h3>
          <div className="space-y-3">
            {roomBreakdown.map((room, i) => {
              const density = DENSITY_LABELS[room.density];
              const pct = totalHours > 0 ? (room.hours / totalHours) * 100 : 0;
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">
                        {room.name || room.roomType}
                      </span>
                      <span className="text-xs text-gray-400">
                        {room.squareFeet.toLocaleString()} SF ·{" "}
                        <span className={density.color}>{density.label}</span>
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-gray-700">
                      {formatNumber(room.hours)} hrs
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-forest-400 rounded-full transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Methodology note */}
      <div className="bg-cream-100 border border-cream-200 rounded-2xl p-4 text-sm text-gray-600">
        <strong className="text-gray-800">How we estimate:</strong> Rightsizing = 1 hr per 100 SF at Average density (0.5× Low, 2× High). Packing and unpacking = 1 hr per 100 SF of destination space. Weeks = total hours ÷ helper capacity.
      </div>

      {/* CTA */}
      <div className="bg-gradient-to-br from-forest-600 to-forest-700 text-white rounded-2xl p-6">
        <h3 className="text-xl font-bold mb-2">Save your estimate & start cataloging</h3>
        <p className="text-forest-100 text-sm mb-5 leading-relaxed">
          Create a free account to save this calculation, photograph and catalog your items with AI analysis, and share access with family or your Top Tier helper.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/sign-up" className="flex-1">
            <Button
              variant="secondary"
              size="lg"
              className="w-full bg-white text-forest-700 hover:bg-cream-100 border-0"
            >
              Create Free Account
            </Button>
          </Link>
          <Link href="/sign-in">
            <Button
              variant="ghost"
              size="lg"
              className="w-full text-white hover:bg-forest-500"
            >
              Sign in
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
