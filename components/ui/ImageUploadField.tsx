"use client";

import { useRef, useState } from "react";
import { ImagePlus, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { prepareImageForUpload } from "@/lib/image-utils";

// One image slot (logo or headshot): tap/click to pick, drag-and-drop on
// desktop, preview, Replace, Remove. Accepts every common photo type
// including iPhone HEIC/HEIF. Photos are converted to JPEG and shrunk in
// the browser first (lib/image-utils) so large phone images never hit
// Vercel's upload size limit.

export const IMAGE_ACCEPT = "image/*,.heic,.heif";

/**
 * Uploads one image to Cloudinary via /api/upload and returns its URL.
 * `normalize` converts to JPEG and shrinks first (always right for photos);
 * otherwise only HEIC or very large files are converted, so logo PNGs keep
 * their transparency.
 */
export async function uploadImageFile(file: File, folder: string, normalize: boolean): Promise<string> {
  const isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  const ready = normalize || isHeic || file.size > 3.5 * 1024 * 1024 ? await prepareImageForUpload(file) : file;
  const fd = new FormData();
  fd.append("file", ready);
  fd.append("tenantId", folder);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.photoUrl) throw new Error("Upload failed");
  return json.photoUrl as string;
}

export function uploadErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  return msg && msg !== "Upload failed" && msg.length < 200 ? msg : "That didn't upload. Try a different photo.";
}

export function ImageUploadField({
  value,
  onChange,
  shape = "square",
  label,
  hint,
  folder,
  theme = "light",
  disabled,
}: {
  value: string;
  onChange: (url: string) => void;
  /** "circle" for headshots (cropped to fill), "square" for logos (never cropped). */
  shape?: "square" | "circle";
  label: string;
  hint?: string;
  /** Cloudinary folder suffix, e.g. "partner-logos" */
  folder: string;
  theme?: "light" | "dark";
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const dark = theme === "dark";
  const circle = shape === "circle";

  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      // Headshots are always normalized; logos only when they must be.
      onChange(await uploadImageFile(file, folder, circle));
    } catch (e) {
      setError(uploadErrorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  function pick() {
    if (!disabled && !uploading) fileRef.current?.click();
  }

  const tile = cn(
    "w-20 h-20 flex-shrink-0 overflow-hidden flex items-center justify-center transition-colors",
    circle ? "rounded-full" : "rounded-2xl",
    value
      ? dark ? "border border-gray-700 bg-white" : "border border-gray-200 bg-white"
      : cn("border-2 border-dashed", dark ? "border-gray-600 bg-gray-900 hover:border-forest-500" : "border-gray-300 bg-white hover:border-forest-400"),
    dragging && "border-forest-500 ring-2 ring-forest-500/30",
    uploading && "opacity-60",
  );

  return (
    <div>
      <p className={cn("text-sm font-medium mb-1.5", dark ? "text-gray-400 text-xs" : "text-gray-700")}>{label}</p>
      <div
        className="flex items-center gap-4"
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !disabled) upload(f);
        }}
      >
        <button type="button" onClick={pick} disabled={disabled} className={tile} aria-label={value ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}>
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl(value, circle)}
              alt={label}
              className={cn("w-full h-full", circle ? "object-cover" : "object-contain p-1.5")}
            />
          ) : circle ? (
            <UserRound className={cn("w-8 h-8", dark ? "text-gray-600" : "text-gray-300")} />
          ) : (
            <ImagePlus className={cn("w-7 h-7", dark ? "text-gray-600" : "text-gray-400")} />
          )}
        </button>
        <div className="text-sm min-w-0">
          <button type="button" onClick={pick} disabled={disabled || uploading} className="font-semibold text-forest-600 hover:text-forest-700 min-h-[44px] sm:min-h-0 disabled:opacity-60">
            {uploading ? "Uploading…" : value ? "Replace" : "Upload"}
          </button>
          {value && !uploading && !disabled && (
            <button type="button" onClick={() => onChange("")} className={cn("ml-3 text-xs", dark ? "text-gray-500 hover:text-gray-300" : "text-gray-400 hover:text-gray-600")}>
              Remove
            </button>
          )}
          {hint && !error && <p className={cn("text-xs mt-0.5", dark ? "text-gray-500" : "text-gray-400")}>{hint}</p>}
          {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
        />
      </div>
    </div>
  );
}

/** Face-centered square crop for headshots; padded square for logos (Cloudinary URLs only). */
export function previewUrl(url: string, circle: boolean): string {
  if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;
  const t = circle ? "c_thumb,g_face,z_0.7,w_160,h_160,f_auto,q_auto" : "c_pad,w_160,h_160,b_white,f_auto,q_auto";
  return url.replace("/upload/", `/upload/${t}/`);
}
