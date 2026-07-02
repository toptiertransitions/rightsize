"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import type { ItemPhoto } from "@/lib/types";

interface PhotoLightboxProps {
  photos: ItemPhoto[];
  initialIndex: number;
  itemName: string;
  onClose: () => void;
}

export function PhotoLightbox({ photos, initialIndex, itemName, onClose }: PhotoLightboxProps) {
  const [idx, setIdx] = useState(initialIndex);
  const [downloading, setDownloading] = useState(false);

  const prev = useCallback(() => setIdx(i => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIdx(i => Math.min(photos.length - 1, i + 1)), [photos.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [prev, next, onClose]);

  const downloadOne = useCallback(async (url: string, filename: string) => {
    setDownloading(true);
    try {
      const res = await fetch(url, { mode: "cors" });
      const blob = await res.blob();
      const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
      if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      window.open(url, "_blank");
    } finally {
      setDownloading(false);
    }
  }, []);

  const downloadAll = useCallback(async () => {
    setDownloading(true);
    try {
      const blobs = await Promise.all(photos.map(p => fetch(p.url, { mode: "cors" }).then(r => r.blob())));
      const files = blobs.map((b, i) => new File([b], `${itemName}-${i + 1}.jpg`, { type: b.type || "image/jpeg" }));
      if (typeof navigator !== "undefined" && navigator.canShare?.({ files })) {
        await navigator.share({ files });
        return;
      }
      for (let i = 0; i < blobs.length; i++) {
        await new Promise<void>(resolve => setTimeout(() => {
          const blobUrl = URL.createObjectURL(blobs[i]);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = files[i].name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
          resolve();
        }, i * 800));
      }
    } catch {
      if (photos.length) window.open(photos[0].url, "_blank");
    } finally {
      setDownloading(false);
    }
  }, [photos, itemName]);

  const current = photos[idx];

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black/95"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <span className="text-white/70 text-sm truncate max-w-xs">{itemName}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-white/50 text-sm tabular-nums">{idx + 1} / {photos.length}</span>
          <button
            onClick={() => downloadOne(current.url, `${itemName}-${idx + 1}.jpg`)}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors disabled:opacity-50"
            title="Download this photo"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </button>
          {photos.length > 1 && (
            <button
              onClick={downloadAll}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors disabled:opacity-50"
              title={`Download all ${photos.length} photos`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4M4 8v1a3 3 0 003 3h10" />
              </svg>
              All ({photos.length})
            </button>
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Close (Esc)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main image area */}
      <div
        className="flex-1 flex items-center justify-center min-h-0 relative"
        onClick={e => e.stopPropagation()}
      >
        {idx > 0 && (
          <button
            onClick={prev}
            className="absolute left-3 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/80 text-white transition-colors"
            aria-label="Previous photo"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        <div className="relative w-full h-full px-16">
          <Image
            key={current.url}
            src={current.url}
            alt={`${itemName} — photo ${idx + 1}`}
            fill
            className="object-contain"
            sizes="100vw"
            priority
          />
        </div>

        {idx < photos.length - 1 && (
          <button
            onClick={next}
            className="absolute right-3 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/80 text-white transition-colors"
            aria-label="Next photo"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      {photos.length > 1 && (
        <div
          className="flex-shrink-0 py-3 overflow-x-auto"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex gap-2 px-4 w-max mx-auto">
            {photos.map((p, i) => (
              <button
                key={p.url}
                onClick={() => setIdx(i)}
                className={`relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 ring-2 transition-all ${
                  i === idx
                    ? "ring-white opacity-100 scale-110"
                    : "ring-transparent opacity-40 hover:opacity-80"
                }`}
                aria-label={`View photo ${i + 1}`}
              >
                <Image src={p.url} alt={`Thumbnail ${i + 1}`} fill className="object-cover" sizes="56px" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
