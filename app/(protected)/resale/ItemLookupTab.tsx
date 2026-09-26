"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { prepareImageForUpload } from "@/lib/image-utils";

interface LookupMatch {
  itemId: string;
  itemName: string;
  category?: string;
  photoUrl: string;
  status: string;
  valueMid: number;
  tenantId: string;
  confidence: "High" | "Medium" | "Low";
  reasoning: string;
}

interface LookupResult {
  identified: { category: string; description: string };
  searchedCount: number;
  match: LookupMatch | null;
}

const CONFIDENCE_STYLES: Record<string, string> = {
  High:   "bg-emerald-50 text-emerald-800 border-emerald-300",
  Medium: "bg-amber-50 text-amber-800 border-amber-300",
  Low:    "bg-gray-100 text-gray-700 border-gray-300",
};

export function ItemLookupTab() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setError(null);
    setResult(null);

    let prepared: File;
    try {
      prepared = await prepareImageForUpload(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that photo.");
      return;
    }

    setPreviewUrl(URL.createObjectURL(prepared));
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", prepared);
      const res = await fetch("/api/resale/item-lookup", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lookup failed");
      setResult(data as LookupResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong running the lookup.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Item Lookup</h2>
        <p className="text-sm text-gray-500 mt-1">
          Take or upload a photo of an item to search the ProFound inventory for its best match.
        </p>
      </div>

      {!previewUrl && (
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center bg-white">
          <p className="text-sm text-gray-500 mb-4">JPEG, HEIC/HEIF, PNG, and most other photo formats are supported.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="px-5 py-2.5 rounded-lg bg-[#2d4a3e] text-white text-sm font-medium hover:bg-[#24392f] transition-colors"
            >
              Take Photo
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Upload Photo
            </button>
          </div>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
      )}

      {previewUrl && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex gap-4 items-start">
            <div className="relative w-28 h-28 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
              <Image src={previewUrl} alt="Query photo" fill className="object-cover" unoptimized />
            </div>
            <div className="flex-1 min-w-0">
              {loading && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-[#2d4a3e] rounded-full animate-spin" />
                  Searching inventory for a match&hellip;
                </div>
              )}

              {error && !loading && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              {result && !loading && (
                <div className="space-y-1">
                  <p className="text-xs text-gray-400">
                    Identified as <span className="text-gray-600">{result.identified.category}</span> &middot; searched {result.searchedCount} item{result.searchedCount === 1 ? "" : "s"}
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={reset}
              className="text-sm text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              Start over
            </button>
          </div>

          {result && !loading && !result.match && (
            <div className="mt-5 pt-5 border-t border-gray-100">
              <p className="text-sm text-gray-600">No match found in the ProFound inventory for this item.</p>
            </div>
          )}

          {result?.match && !loading && (
            <div className="mt-5 pt-5 border-t border-gray-100">
              <div className="flex gap-4">
                <div className="relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                  {result.match.photoUrl && (
                    <Image src={result.match.photoUrl} alt={result.match.itemName} fill className="object-cover" unoptimized />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-gray-900 truncate">{result.match.itemName}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${CONFIDENCE_STYLES[result.match.confidence]}`}>
                      {result.match.confidence} confidence
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {result.match.category || "Uncategorized"} &middot; {result.match.status} &middot; ${result.match.valueMid.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-600 mt-2">{result.match.reasoning}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
