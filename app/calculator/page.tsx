import type { Metadata } from "next";
import Link from "next/link";
import { CalculatorForm } from "@/components/calculator/CalculatorForm";
import { getServices } from "@/lib/airtable";

export const metadata: Metadata = {
  title: "Rightsizing Calculator — Free Estimate | Rightsize by Top Tier",
  description:
    "Get a free room-by-room estimate of how many hours your senior downsizing move will take. No account needed.",
};

export default async function CalculatorPage() {
  const services = await getServices().catch(() => []);
  return (
    <div className="min-h-screen bg-cream-50">
      {/* Header */}
      <header className="bg-white border-b border-cream-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-forest-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <div>
              <div className="font-bold text-forest-700 text-sm leading-none">Rightsize</div>
              <div className="text-[9px] text-gray-400 leading-none">by Top Tier</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/sign-in"
              className="text-sm text-gray-600 hover:text-forest-700 font-medium px-3 py-2"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="text-sm bg-forest-600 text-white px-4 py-2 rounded-xl hover:bg-forest-700 font-medium transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-20">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-forest-50 border border-forest-100 text-forest-700 text-xs font-medium px-3 py-1.5 rounded-full mb-4">
            Free · No account required
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
            Rightsizing Calculator
          </h1>
          <p className="text-gray-600 max-w-xl mx-auto leading-relaxed">
            Enter your rooms, density of belongings, and where you&apos;re
            moving to. We&apos;ll estimate the hours — and weeks — it takes to
            sort, pack, and settle in.
          </p>
        </div>

        <CalculatorForm services={services} />
      </main>
    </div>
  );
}
