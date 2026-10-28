"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { IMAGE_ACCEPT, previewUrl, uploadErrorMessage, uploadImageFile } from "./ImageUploadField";

// Compact headshot slot for table rows: a small circle that uploads and
// saves on pick. Empty shows a camera; filled shows the face, with
// Replace/Remove on click via the native picker plus a small remove link.

export function AvatarUploadButton({
  value,
  onSave,
  name,
  folder,
  theme = "light",
  disabled,
  size = 36,
}: {
  value?: string;
  /** Persist the new URL ("" to remove). Throw to show an error. */
  onSave: (url: string) => Promise<void>;
  name: string;
  folder: string;
  theme?: "light" | "dark";
  disabled?: boolean;
  size?: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dark = theme === "dark";

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await task(); } catch (e) { setError(uploadErrorMessage(e)); } finally { setBusy(false); }
  }

  if (disabled && !value) return <span className="text-xs text-gray-400">—</span>;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => fileRef.current?.click()}
        title={error || (value ? `Replace ${name}'s headshot` : `Add a headshot for ${name}`)}
        aria-label={value ? `Replace ${name}'s headshot` : `Add a headshot for ${name}`}
        style={{ width: size, height: size }}
        className={cn(
          "group relative flex-shrink-0 rounded-full overflow-hidden flex items-center justify-center transition-colors",
          value ? "ring-1 ring-black/5" : cn("border border-dashed", dark ? "border-gray-600 hover:border-forest-500" : "border-gray-300 hover:border-forest-500"),
          error && "ring-2 ring-red-400",
          disabled ? "cursor-default" : "cursor-pointer",
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl(value, true)} alt={`${name} headshot`} className="w-full h-full object-cover" />
        ) : (
          <Camera className={cn("w-4 h-4", dark ? "text-gray-500" : "text-gray-400")} />
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="w-4 h-4 text-white animate-spin" />
          </span>
        )}
      </button>
      {value && !disabled && !busy && (
        <button
          type="button"
          onClick={() => run(() => onSave(""))}
          className={cn("text-[11px]", dark ? "text-gray-500 hover:text-gray-300" : "text-gray-400 hover:text-gray-600")}
        >
          Remove
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) run(async () => onSave(await uploadImageFile(f, folder, true)));
        }}
      />
    </div>
  );
}
