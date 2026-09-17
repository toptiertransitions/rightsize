"use client";

import { useState } from "react";
import { prepareImageForUpload } from "@/lib/image-utils";
import { safeJson } from "@/lib/utils";
import { NativeFileLink } from "@/components/shared/NativeFileLink";

export interface MessageAttachmentData {
  url: string;
  publicId: string;
  fileName: string;
  resourceType: "image" | "raw";
}

/**
 * Runs HEIC/HEIF -> JPEG conversion and compression on a just-picked file
 * (same prepareImageForUpload used for item photos/floorplans). MUST be
 * called at selection time, before building any local preview or storing
 * the file — a raw, unconverted HEIC file can't be rendered by <img> in
 * any browser but Safari, so previewing it first shows a broken image,
 * and deferring conversion to send-time only surfaces a failure after the
 * user thinks they've already attached the photo.
 */
export async function prepareMessageAttachment(rawFile: File): Promise<File> {
  return prepareImageForUpload(rawFile);
}

/**
 * Uploads an already-prepared file (see prepareMessageAttachment above)
 * via the shared /api/upload endpoint and returns everything needed to
 * attach it to a message. `fileName` matches the possibly-renamed
 * (.heic -> .jpg) name that actually got uploaded — never the stale
 * original.
 */
export async function uploadMessageAttachment(file: File, tenantId?: string): Promise<MessageAttachmentData> {
  const formData = new FormData();
  formData.append("file", file);
  if (tenantId) formData.append("tenantId", tenantId);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  const data = await safeJson<{ photoUrl?: string; photoPublicId?: string; error?: string }>(res);
  if (!res.ok || !data.photoUrl || !data.photoPublicId) {
    throw new Error(data.error || `Couldn't upload "${file.name}"`);
  }
  return {
    url: data.photoUrl,
    publicId: data.photoPublicId,
    fileName: file.name,
    resourceType: file.type.startsWith("image/") ? "image" : "raw",
  };
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

/** Pre-send preview chip shown above the compose box, with a remove (x) button. */
export function AttachmentPendingChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith("image/");
  const [previewUrl] = useState(() => (isImage ? URL.createObjectURL(file) : null));
  return (
    <div className="flex items-center gap-2 mb-2 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200 w-fit max-w-full">
      {isImage && previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt={file.name} className="w-8 h-8 rounded object-cover flex-shrink-0" />
      ) : (
        <FileIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
      )}
      <span className="text-xs text-gray-700 truncate max-w-[180px]">{file.name}</span>
      <button type="button" onClick={onRemove} className="text-gray-400 hover:text-gray-600 flex-shrink-0 ml-1">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Attachment as it appears inline in a sent message. Images render inline
 * (click to view full-size in a new tab); any file type gets a clickable
 * name (view/preview in a new tab — browsers natively render PDFs, etc.)
 * plus an explicit Download control. fl_attachment + the `download`
 * attribute force the browser to save with the ORIGINAL filename/extension
 * every time, regardless of Cloudinary's own (often renamed/random)
 * public_id — same pattern already used for Floorplans/Daily Recap files.
 */
export function AttachmentView({ attachment }: { attachment: MessageAttachmentData }) {
  const downloadUrl = attachment.url.replace("/upload/", "/upload/fl_attachment/");

  if (attachment.resourceType === "image") {
    return (
      <div className="mt-2 max-w-xs">
        <NativeFileLink href={attachment.url} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attachment.url}
            alt={attachment.fileName}
            className="rounded-lg border border-gray-200 max-h-64 w-auto object-contain block"
          />
        </NativeFileLink>
        <NativeFileLink
          href={downloadUrl}
          download={attachment.fileName}
          className="mt-1 inline-flex items-center gap-1 text-[11px] text-forest-700 hover:text-forest-800 font-medium"
        >
          <DownloadIcon className="w-3 h-3" />
          Download {attachment.fileName}
        </NativeFileLink>
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 w-fit max-w-full">
      <NativeFileLink
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 min-w-0 hover:underline"
        title={`View ${attachment.fileName}`}
      >
        <FileIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <span className="text-xs text-gray-700 truncate max-w-[220px]">{attachment.fileName}</span>
      </NativeFileLink>
      <NativeFileLink
        href={downloadUrl}
        download={attachment.fileName}
        title={`Download ${attachment.fileName}`}
        className="text-gray-400 hover:text-forest-600 flex-shrink-0 ml-1"
      >
        <DownloadIcon className="w-3.5 h-3.5" />
      </NativeFileLink>
    </div>
  );
}

export function AttachButton({ onSelect, disabled }: { onSelect: (file: File) => void; disabled?: boolean }) {
  return (
    <label
      title="Attach an image or file"
      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 text-gray-400 hover:text-forest-600 hover:border-forest-300 transition-colors cursor-pointer flex-shrink-0 ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
      </svg>
      <input
        type="file"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onSelect(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}
