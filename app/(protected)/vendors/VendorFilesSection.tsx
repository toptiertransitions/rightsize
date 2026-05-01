"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import type { ProjectFile } from "@/lib/types";

interface Props {
  vendorId: string;
  tenantId: string;
  initialFiles: ProjectFile[];
}

function isPdf(file: ProjectFile) {
  return (
    file.resourceType === "raw" ||
    file.fileName.toLowerCase().endsWith(".pdf")
  );
}

// For raw resources (PDFs/docs), Cloudinary serves them as octet-stream with no
// extension in the URL, causing browsers to fail. fl_attachment tells Cloudinary
// to add Content-Disposition: attachment so the browser downloads the file instead.
function fileDownloadUrl(file: ProjectFile): string {
  if (file.resourceType === "raw") {
    return file.cloudinaryUrl.replace("/upload/", "/upload/fl_attachment/");
  }
  return file.cloudinaryUrl;
}

function PdfIcon() {
  return (
    <div className="w-8 h-8 flex-shrink-0 rounded bg-red-50 border border-red-100 flex items-center justify-center">
      <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 2a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6H6zm7 1.5L18.5 9H13V3.5zM8.5 13h1.75c.97 0 1.75.78 1.75 1.75S11.22 16.5 10.25 16.5H9.5V18H8.5v-5zm1 2.5h.75a.75.75 0 000-1.5H9.5v1.5zm3.5-2.5h1.5c1.1 0 2 .9 2 2s-.9 2-2 2H13v-4zm1 3h.5a1 1 0 000-2H14v2zm3-3h1v1.5h1V14h-1v1H18v-3z" />
      </svg>
    </div>
  );
}

interface UploadingFile {
  id: string;
  name: string;
  progress: number; // 0–100, we'll use indeterminate
}

export function VendorFilesSection({ vendorId, tenantId, initialFiles }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [files, setFiles] = useState<ProjectFile[]>(initialFiles);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (fileList: FileList) => {
    setError(null);
    const items = Array.from(fileList);
    if (items.length === 0) return;

    const newUploading: UploadingFile[] = items.map((f) => ({
      id: Math.random().toString(36).slice(2),
      name: f.name,
      progress: 0,
    }));
    setUploading((prev) => [...prev, ...newUploading]);

    await Promise.all(
      items.map(async (file, idx) => {
        const uploadId = newUploading[idx].id;
        try {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("tenantId", tenantId);
          fd.append("tag", "Vendor File");
          fd.append("vendorId", vendorId);

          const res = await fetch("/api/files", { method: "POST", body: fd });
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d.error ?? "Upload failed");
          }
          const { file: projectFile } = await res.json();
          setFiles((prev) => [projectFile, ...prev]);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Upload failed");
        } finally {
          setUploading((prev) => prev.filter((u) => u.id !== uploadId));
        }
      })
    );
  };

  const handleDelete = async (file: ProjectFile) => {
    setError(null);
    setDeletingIds((prev) => new Set(prev).add(file.id));
    try {
      const params = new URLSearchParams({
        id: file.id,
        publicId: file.cloudinaryPublicId,
        resourceType: file.resourceType,
        tenantId,
        vendorId,
      });
      const res = await fetch(`/api/files?${params}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Delete failed");
      }
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
    }
  };

  const totalCount = files.length + uploading.length;

  return (
    <div className="border-t border-gray-100 mt-3">
      {/* Toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-1 pt-3 pb-1 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <svg
            className={`w-3 h-3 transition-transform ${expanded ? "rotate-0" : "-rotate-90"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          Files ({totalCount})
        </span>
      </button>

      {expanded && (
        <div className="pt-1 pb-2 space-y-1.5">
          {/* File list */}
          {files.map((file) => (
            <div
              key={file.id}
              className={`flex items-center gap-2 group transition-opacity ${deletingIds.has(file.id) ? "opacity-40" : ""}`}
            >
              {isPdf(file) ? (
                <PdfIcon />
              ) : (
                <div className="w-8 h-8 flex-shrink-0 rounded overflow-hidden border border-gray-100 bg-gray-50">
                  <Image
                    src={file.cloudinaryUrl}
                    alt={file.fileName}
                    width={32}
                    height={32}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                </div>
              )}
              <a
                href={fileDownloadUrl(file)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-xs text-gray-700 hover:text-forest-600 hover:underline truncate"
                title={file.fileName}
              >
                {file.fileName}
              </a>
              <button
                onClick={() => handleDelete(file)}
                disabled={deletingIds.has(file.id)}
                className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-30"
                aria-label="Delete file"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          {/* Uploading placeholders */}
          {uploading.map((u) => (
            <div key={u.id} className="flex items-center gap-2">
              <div className="w-8 h-8 flex-shrink-0 rounded bg-gray-100 border border-gray-200 flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-300 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
              <span className="flex-1 text-xs text-gray-400 truncate">{u.name}</span>
            </div>
          ))}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-500 px-1">{error}</p>
          )}

          {/* Add File button */}
          <button
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs text-forest-600 hover:text-forest-700 font-medium mt-1 px-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add File
          </button>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      )}
    </div>
  );
}
