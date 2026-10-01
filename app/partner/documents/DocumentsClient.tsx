"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { DocumentRecord } from "@/lib/types";

interface Project {
  tenantId: string;
  name: string;
}

interface Props {
  projects: Project[];
}

const STATUS_STYLES: Record<string, string> = {
  "Pending Scan": "bg-amber-50 text-amber-700 border border-amber-200",
  Clean: "bg-forest-50 text-forest-700 border border-forest-200",
  Quarantined: "bg-red-50 text-red-700 border border-red-200",
  Deleted: "bg-gray-50 text-gray-400 border border-gray-200",
};

export function DocumentsClient({ projects }: Props) {
  const [tenantId, setTenantId] = useState(projects[0]?.tenantId ?? "");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/partner/documents");
      const d = await res.json();
      setDocs(d.documents ?? []);
    } catch {
      setError("Couldn't load your shared documents.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const projectName = (id: string) => projects.find((p) => p.tenantId === id)?.name ?? id;

  const handleUpload = async (fileList: FileList) => {
    if (!tenantId) {
      setError("Choose a project first.");
      return;
    }
    setError(null);
    const files = Array.from(fileList);
    setUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("tenantId", tenantId);
        if (note.trim()) fd.append("note", note.trim());

        const res = await fetch("/api/partner/documents", { method: "POST", body: fd });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(d.error ?? "Upload failed");
          continue;
        }
        if (d.status === "Quarantined") {
          setError(d.message ?? "File is pending a security review.");
        }
      }
      setNote("");
      await loadDocs();
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (fileKey: string) => {
    setDeletingKeys((prev) => new Set(prev).add(fileKey));
    try {
      const res = await fetch(`/api/partner/documents/${fileKey}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Remove failed");
      }
      setDocs((prev) => prev.filter((d) => d.fileKey !== fileKey));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setDeletingKeys((prev) => {
        const next = new Set(prev);
        next.delete(fileKey);
        return next;
      });
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[#2d4a3e]">Documents</h1>
      <p className="text-sm text-gray-500">Share a file with a client. It shows up on their Partners page once it clears a quick security check.</p>

      {projects.length === 0 ? (
        <p className="text-sm text-gray-400">No active referred projects yet.</p>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Project</label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="h-9 w-full sm:w-auto pl-3 pr-8 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#2d4a3e]/30 appearance-none cursor-pointer"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
            >
              {projects.map((p) => (
                <option key={p.tenantId} value={p.tenantId}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Anything the client should know about this file"
              className="w-full rounded-lg border border-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#2d4a3e]/30"
            />
          </div>

          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Please don&rsquo;t upload Social Security numbers or full financial account numbers unless absolutely necessary.
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={uploading || !tenantId}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl text-sm font-semibold bg-[#2d4a3e] text-white hover:bg-[#23392f] disabled:opacity-50 transition-colors"
            >
              {uploading ? "Uploading…" : "Choose Files"}
            </button>
            <span className="text-xs text-gray-400">PDF, Word, Excel, PNG, JPG, HEIC — up to 25MB each</span>
          </div>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.heic"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) handleUpload(e.target.files);
              e.target.value = "";
            }}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">What you&rsquo;ve shared</h2>
        {!loaded ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing shared yet.</p>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div
                key={doc.fileKey}
                className={`flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 transition-opacity ${deletingKeys.has(doc.fileKey) ? "opacity-40" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate" title={doc.originalFileName}>{doc.originalFileName}</p>
                  <p className="text-xs text-gray-400">{projectName(doc.tenantId)} &middot; {new Date(doc.uploadedAt).toLocaleDateString()}</p>
                </div>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[doc.status] ?? ""}`}>{doc.status}</span>
                <button
                  onClick={() => handleRemove(doc.fileKey)}
                  disabled={deletingKeys.has(doc.fileKey)}
                  className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30"
                  aria-label="Remove file"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
