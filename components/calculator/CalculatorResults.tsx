"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { formatNumber } from "@/lib/utils";
import { CALCULATOR_CONFIG } from "@/lib/config";
import type { ServiceCalcResult } from "@/lib/types";

interface CalculatorResultsProps {
  result: ServiceCalcResult;
}

export function CalculatorResults({ result }: CalculatorResultsProps) {
  const { serviceRows, totalHours, estimatedWeeks, helperType } = result;
  const hoursPerWeek = CALCULATOR_CONFIG.helperHoursPerWeek[helperType];

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

      {/* Service breakdown */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 text-sm">Service Breakdown</h3>
          <p className="text-xs text-gray-400 mt-0.5">Hours estimated per service at High Touch (×1.5)</p>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {serviceRows.map((row, i) => {
              const pct = totalHours > 0 ? (row.hours / totalHours) * 100 : 0;
              return (
                <tr key={row.serviceId} className={i % 2 === 1 ? "bg-gray-50/60" : ""}>
                  <td className="px-5 py-3 text-gray-700">{row.serviceName}</td>
                  <td className="px-5 py-3 w-28">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-forest-400 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                    {formatNumber(row.hours)} hrs
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-forest-200 bg-forest-50">
              <td className="px-5 py-3 font-bold text-forest-700" colSpan={2}>Total</td>
              <td className="px-5 py-3 text-right font-bold text-forest-700 whitespace-nowrap">
                {formatNumber(totalHours)} hrs
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Methodology note */}
      <div className="bg-cream-100 border border-cream-200 rounded-2xl p-4 text-sm text-gray-600">
        <strong className="text-gray-800">How we estimate:</strong> Each service is calculated per room based on square footage and how full the room is (Low / Average / High). Services like Unpacking and Setup use your new home's square footage instead. A High Touch multiplier (×1.5) is applied across all services to reflect the full-service care of a senior move. Weeks = total hours ÷ helper capacity.
      </div>

      {/* CTA */}
      <div className="bg-gradient-to-br from-forest-600 to-forest-700 text-white rounded-2xl p-6">
        <h3 className="text-xl font-bold mb-2">Save your estimate &amp; start cataloging</h3>
        <p className="text-forest-100 text-sm mb-5 leading-relaxed">
          Create a free account to save this calculation, photograph and catalog your items with AI analysis, and share access with family or your Top Tier helper.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/sign-up" className="flex-1">
            <Button variant="secondary" size="lg" className="w-full bg-white text-forest-700 hover:bg-cream-100 border-0">
              Create Free Account
            </Button>
          </Link>
          <Link href="/sign-in">
            <Button variant="ghost" size="lg" className="w-full text-white hover:bg-forest-500">
              Sign in
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
