"use client";

import { useState, useRef } from "react";
import type { ProjectFile, FileTag } from "@/lib/types";

// ─── Tag config ───────────────────────────────────────────────────────────────
const TAG_CONFIG: Record<FileTag, { label: string; color: string }> = {
  "Floorplan":    { label: "Floorplan",    color: "bg-indigo-100 text-indigo-800" },
  "Room Image":   { label: "Room Image",   color: "bg-green-100 text-green-800" },
  "Layout Image": { label: "Layout Image", color: "bg-violet-100 text-violet-800" },
  "Damage Image": { label: "Damage Image", color: "bg-red-100 text-red-800" },
};
const TAG_ORDER: FileTag[] = ["Floorplan", "Room Image", "Layout Image", "Damage Image"];

// ─── Cloudinary thumbnail transform ──────────────────────────────────────────
function getThumbnailUrl(cloudinaryUrl: string): string {
  return cloudinaryUrl.replace("/upload/", "/upload/w_400,h_280,c_fill,q_auto,f_auto/");
}

// ─── PDF icon ─────────────────────────────────────────────────────────────────
function PdfIcon() {
  return (
    <svg className="w-10 h-10 text-red-400" fill="currentColor" viewBox="0 0 24 24">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8.5 17.5c-.3 0-.5-.2-.5-.5s.2-.5.5-.5.5.2.5.5-.2.5-.5.5zm0-2c-.8 0-1.5.7-1.5 1.5S7.7 18.5 8.5 18.5 10 17.8 10 17s-.7-1.5-1.5-1.5zm3.5-1h-1v3h1v-3zm2 0h-1v3h1v-1.5H15v-1h-1v-.5zm-5 0H7v3h1v-1h1c.6 0 1-.4 1-1s-.4-1-1-1zm0 1H8v-.5h1v.5z"/>
    </svg>
  );
}

// ─── Upload modal ─────────────────────────────────────────────────────────────
interface UploadModalProps {
  tenantId: string;
  onClose: () => void;
  onUploaded: (files: ProjectFile[]) => void;
}

function UploadModal({ tenantId, onClose, onUploaded }: UploadModalProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [tag, setTag] = useState<FileTag>("Floorplan");
  const [roomLabel, setRoomLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setSelectedFiles(files);
  };

  const handleUpload = async () => {
    if (!selectedFiles.length) { setError("Select at least one file"); return; }
    setUploading(true);
    setError("");
    const results: ProjectFile[] = [];
    try {
      for (const file of selectedFiles) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("tenantId", tenantId);
        fd.append("tag", tag);
        if (tag === "Room Image" && roomLabel.trim()) {
          fd.append("roomLabel", roomLabel.trim());
        }
        const res = await fetch("/api/files", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        results.push(data.file as ProjectFile);
      }
      onUploaded(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const inputCls = "w-full h-11 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Add Files</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* File input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Files</label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,image/*,application/pdf"
              onChange={handleFileChange}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-forest-50 file:text-forest-700 file:font-medium hover:file:bg-forest-100 cursor-pointer"
            />
            {selectedFiles.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">{selectedFiles.length} file{selectedFiles.length > 1 ? "s" : ""} selected</p>
            )}
          </div>

          {/* Tag */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tag</label>
            <select value={tag} onChange={e => setTag(e.target.value as FileTag)} className={inputCls}>
              {TAG_ORDER.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Room label (only for Room Image) */}
          {tag === "Room Image" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Room Label <span className="text-xs text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={roomLabel}
                onChange={e => setRoomLabel(e.target.value)}
                placeholder="e.g. Master Bedroom"
                className={inputCls}
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex gap-3 border-t border-gray-100">
          <button onClick={onClose} disabled={uploading}
            className="flex-1 h-11 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleUpload} disabled={uploading || !selectedFiles.length}
            className="flex-1 h-11 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors disabled:opacity-50">
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit file modal ──────────────────────────────────────────────────────────
interface EditFileModalProps {
  file: ProjectFile;
  onClose: () => void;
  onSaved: (updated: ProjectFile) => void;
  onDeleted: (file: ProjectFile) => void;
}

function EditFileModal({ file, onClose, onSaved, onDeleted }: EditFileModalProps) {
  const [fileName, setFileName] = useState(file.fileName);
  const [fileTag, setFileTag] = useState<FileTag>(file.fileTag);
  const [roomLabel, setRoomLabel] = useState(file.roomLabel ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const inputCls = "w-full h-11 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white";

  const handleSave = async () => {
    if (!fileName.trim()) { setError("File name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: file.id,
          tenantId: file.tenantId,
          fileName: fileName.trim(),
          fileTag,
          roomLabel: fileTag === "Room Image" ? roomLabel.trim() : "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSaved(data.file as ProjectFile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      const params = new URLSearchParams({
        id: file.id,
        publicId: file.cloudinaryPublicId,
        resourceType: file.resourceType,
        tenantId: file.tenantId,
      });
      const res = await fetch(`/api/files?${params}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Delete failed");
      }
      onDeleted(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Edit File</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">File Name</label>
            <input
              type="text"
              value={fileName}
              onChange={e => setFileName(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tag</label>
            <select value={fileTag} onChange={e => setFileTag(e.target.value as FileTag)} className={inputCls}>
              {TAG_ORDER.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {fileTag === "Room Image" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Room Label <span className="text-xs text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={roomLabel}
                onChange={e => setRoomLabel(e.target.value)}
                placeholder="e.g. Master Bedroom"
                className={inputCls}
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center gap-3 border-t border-gray-100">
          <button
            onClick={handleDelete}
            disabled={deleting || saving}
            className="h-11 px-4 rounded-xl border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <div className="flex-1" />
          <button onClick={onClose} disabled={saving || deleting}
            className="h-11 px-4 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || deleting}
            className="h-11 px-4 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── File card ────────────────────────────────────────────────────────────────
interface FileCardProps {
  file: ProjectFile;
  canEdit: boolean;
  onEdit: (file: ProjectFile) => void;
}

function FileCard({ file, canEdit, onEdit }: FileCardProps) {
  const tagCfg = TAG_CONFIG[file.fileTag] ?? { label: file.fileTag, color: "bg-gray-100 text-gray-700" };

  return (
    <a
      href={file.cloudinaryUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow block"
    >
      {/* Thumbnail / placeholder */}
      <div className="w-full h-36 bg-gray-50 flex items-center justify-center overflow-hidden">
        {file.resourceType === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={getThumbnailUrl(file.cloudinaryUrl)}
            alt={file.fileName}
            className="w-full h-full object-cover"
          />
        ) : (
          <PdfIcon />
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-xs font-medium text-gray-800 truncate" title={file.fileName}>
          {file.fileName}
        </p>
        {file.roomLabel && (
          <p className="text-xs text-gray-400 truncate mt-0.5">{file.roomLabel}</p>
        )}
        <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${tagCfg.color}`}>
          {tagCfg.label}
        </span>
      </div>

      {/* Edit button */}
      {canEdit && (
        <button
          onClick={e => { e.preventDefault(); onEdit(file); }}
          className="absolute top-2 left-2 w-7 h-7 flex items-center justify-center rounded-full bg-white/90 text-gray-400 hover:text-gray-700 hover:bg-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
          title="Edit file"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6.586-6.586a2 2 0 112.828 2.828L11.828 13.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z" />
          </svg>
        </button>
      )}
    </a>
  );
}

// ─── FloorplansSection ────────────────────────────────────────────────────────
interface FloorplansSectionProps {
  tenantId: string;
  canEdit: boolean;
  initialFiles: ProjectFile[];
}

export function FloorplansSection({ tenantId, canEdit, initialFiles }: FloorplansSectionProps) {
  const [files, setFiles] = useState<ProjectFile[]>(initialFiles);
  const [showUpload, setShowUpload] = useState(false);
  const [editingFile, setEditingFile] = useState<ProjectFile | null>(null);

  const handleUploaded = (newFiles: ProjectFile[]) => {
    setFiles(prev => [...newFiles, ...prev]);
    setShowUpload(false);
  };

  const handleUpdated = (updated: ProjectFile) => {
    setFiles(prev => prev.map(f => f.id === updated.id ? updated : f));
  };

  const handleDeletedFromEdit = (deleted: ProjectFile) => {
    setFiles(prev => prev.filter(f => f.id !== deleted.id));
  };

  // Hide section entirely for non-editors when there are no files
  if (files.length === 0 && !canEdit) return null;

  // Group by tag in defined order
  const grouped = TAG_ORDER.reduce<Record<FileTag, ProjectFile[]>>((acc, tag) => {
    acc[tag] = files.filter(f => f.fileTag === tag);
    return acc;
  }, {} as Record<FileTag, ProjectFile[]>);

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Floorplans & Images</h2>
          <p className="text-sm text-gray-500 mt-0.5">Reference documents for your move</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowUpload(true)}
            className="h-9 px-4 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors"
          >
            + Add Files
          </button>
        )}
      </div>

      {/* Empty state */}
      {files.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-12 text-center">
          <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-gray-400">No files yet. Upload floorplans, room images, and more.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {TAG_ORDER.map(tag => {
            const tagFiles = grouped[tag];
            if (!tagFiles.length) return null;
            const tagCfg = TAG_CONFIG[tag];
            return (
              <div key={tag}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${tagCfg.color}`}>
                    {tagCfg.label}
                  </span>
                  <span className="text-xs text-gray-400">{tagFiles.length}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {tagFiles.map(file => (
                    <FileCard
                      key={file.id}
                      file={file}
                      canEdit={canEdit}
                      onEdit={f => setEditingFile(f)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          tenantId={tenantId}
          onClose={() => setShowUpload(false)}
          onUploaded={handleUploaded}
        />
      )}

      {/* Edit modal */}
      {editingFile && (
        <EditFileModal
          file={editingFile}
          onClose={() => setEditingFile(null)}
          onSaved={f => { handleUpdated(f); setEditingFile(null); }}
          onDeleted={f => { handleDeletedFromEdit(f); setEditingFile(null); }}
        />
      )}
    </section>
  );
}
