"use client";
import { useState } from "react";
import Image from "next/image";

interface Props {
  vendorName: string;
  vendorType: string;
  city: string;
  state: string;
  pocName: string;
  itemThumbs: Array<{ url?: string; name: string }>;
  itemCount: number;
  agingDays: number;
  nextVendorName?: string;
  onSkip: () => Promise<void>;
  onClaim: () => Promise<void>;
}

export function OutreachActiveCard({
  vendorName, vendorType, city, state, pocName,
  itemThumbs, itemCount, agingDays, nextVendorName, onSkip, onClaim,
}: Props) {
  const [confirm, setConfirm] = useState<"skip" | "claim" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const dotColor = agingDays <= 3 ? "bg-green-500" : agingDays <= 6 ? "bg-amber-500" : "bg-red-500";
  const borderColor = agingDays > 6 ? "border-l-4 border-l-red-400" : agingDays > 3 ? "border-l-4 border-l-amber-400" : "";
  const agingText = agingDays === 0 ? "Sent today · No response yet" : `Sent ${agingDays} day${agingDays !== 1 ? 's' : ''} ago · No response yet`;

  const visibleThumbs = itemThumbs.slice(0, 5);
  const overflow = itemThumbs.length - 5;

  async function handleConfirm(action: "skip" | "claim") {
    setLoading(true);
    setError("");
    try {
      if (action === "skip") await onSkip();
      else await onClaim();
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setLoading(false);
      setConfirm(null);
    }
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-xl p-5 shadow-sm mb-4 ${borderColor}`}>
      <p className="text-xl font-semibold text-[#2d4a3e]">{vendorName}</p>
      <p className="text-sm text-gray-500 mt-0.5">{vendorType} · {city}, {state}</p>
      <p className="text-sm text-gray-500 mt-0.5">POC: {pocName}</p>

      <div className="flex items-center gap-2 mt-4 flex-wrap">
        {visibleThumbs.map((t, i) => (
          <div key={i} className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
            {t.url ? (
              <Image src={t.url} alt={t.name} width={48} height={48} className="object-cover w-full h-full" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>
        ))}
        {overflow > 0 && (
          <span className="text-sm text-gray-400 ml-1">+{overflow} more</span>
        )}
      </div>
      <p className="text-sm text-gray-500 mt-2">{itemCount} item{itemCount !== 1 ? 's' : ''} sent</p>

      <div className="flex items-center gap-2 mt-2">
        <div className={`w-2 h-2 rounded-full ${dotColor} flex-shrink-0`} />
        <p className="text-sm text-gray-500">{agingText}</p>
      </div>

      {/* Action buttons */}
      {!confirm && (
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => setConfirm("skip")}
            className="flex-1 min-h-[44px] border-2 border-[#2d4a3e] text-[#2d4a3e] font-semibold rounded-lg text-sm hover:bg-[#2d4a3e]/5 transition-colors"
            disabled={loading}>
            Skip to Next Vendor
          </button>
          <button
            onClick={() => setConfirm("claim")}
            className="flex-1 min-h-[44px] bg-[#C9A96E] text-white font-semibold rounded-lg text-sm hover:bg-[#b8924f] transition-colors"
            disabled={loading}>
            Mark as Claimed
          </button>
        </div>
      )}

      {/* Inline confirmation */}
      {confirm === "skip" && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm font-medium text-gray-800">
            {nextVendorName ? `Move these items to ${nextVendorName}?` : "Skip this vendor?"}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">{vendorName} will no longer receive updates on these items.</p>
          <div className="flex gap-3 mt-3">
            <button onClick={() => handleConfirm("skip")} disabled={loading}
              className="min-h-[44px] px-4 bg-[#2d4a3e] text-white font-medium rounded-lg text-sm hover:bg-[#1e3329]">
              {loading ? "Moving…" : "Yes, move to next"}
            </button>
            <button onClick={() => setConfirm(null)} disabled={loading}
              className="min-h-[44px] px-4 border border-gray-300 text-gray-700 font-medium rounded-lg text-sm hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {confirm === "claim" && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm font-medium text-gray-800">
            Mark all {itemCount} item{itemCount !== 1 ? 's' : ''} as claimed by {vendorName}?
          </p>
          <p className="text-sm text-gray-500 mt-0.5">This closes out the outreach for these items.</p>
          <div className="flex gap-3 mt-3">
            <button onClick={() => handleConfirm("claim")} disabled={loading}
              className="min-h-[44px] px-4 bg-[#C9A96E] text-white font-medium rounded-lg text-sm hover:bg-[#b8924f]">
              {loading ? "Marking…" : "Yes, mark as claimed"}
            </button>
            <button onClick={() => setConfirm(null)} disabled={loading}
              className="min-h-[44px] px-4 border border-gray-300 text-gray-700 font-medium rounded-lg text-sm hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}
