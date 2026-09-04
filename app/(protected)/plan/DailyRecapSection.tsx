"use client";

import { useState } from "react";
import type { ProjectFile } from "@/lib/types";

interface DailyRecapSectionProps {
  tenantId: string;
  initialFiles: ProjectFile[];
  canEdit: boolean; // TTTStaff, TTTManager, TTTAdmin
}

function formatRecapDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return new Date(`${year}-${month}-${day}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

interface RecapCardProps {
  file: ProjectFile;
  canEdit: boolean;
  onSaved: (updated: ProjectFile) => void;
}

function RecapCard({ file, canEdit, onSaved }: RecapCardProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(file.aiRecapText ?? "");
  const [date, setDate] = useState(file.recapDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const displayDate = file.recapDate ? formatRecapDate(file.recapDate) : "No date recorded";
  const isPending = !file.aiRecapText;

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: file.id,
          tenantId: file.tenantId,
          fileName: file.fileName,
          fileTag: file.fileTag,
          roomLabel: file.roomLabel,
          aiRecapText: text,
          recapDate: date,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSaved(data.file as ProjectFile);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setText(file.aiRecapText ?? "");
    setDate(file.recapDate ?? "");
    setEditing(false);
    setError("");
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-700">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </span>
          {editing ? (
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="text-sm font-semibold text-gray-900 border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          ) : (
            <span className="text-sm font-semibold text-gray-900">{displayDate}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Link to original file */}
          <a
            href={file.resourceType === "image"
              ? file.cloudinaryUrl
              : file.cloudinaryUrl.replace("/upload/", "/upload/fl_attachment/")}
            target={file.resourceType === "image" ? "_blank" : undefined}
            rel={file.resourceType === "image" ? "noopener noreferrer" : undefined}
            download={file.resourceType !== "image" ? file.fileName : undefined}
            className="text-xs text-gray-400 hover:text-emerald-600 transition-colors flex items-center gap-1"
            title={file.fileName}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            View file
          </a>
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6.586-6.586a2 2 0 112.828 2.828L11.828 13.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z" />
              </svg>
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="px-5 py-4">
        {isPending && !editing ? (
          <div className="flex items-center gap-2 text-sm text-amber-600">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            AI transcription in progress — check back shortly
          </div>
        ) : editing ? (
          <div className="space-y-3">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={6}
              placeholder="Transcribed notes will appear here…"
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleCancel}
                disabled={saving}
                className="h-9 px-4 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="h-9 px-4 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
            {file.aiRecapText || <span className="text-gray-400 italic">No notes transcribed yet</span>}
          </p>
        )}
      </div>
    </div>
  );
}

export function DailyRecapSection({ tenantId, initialFiles, canEdit }: DailyRecapSectionProps) {
  const recapFiles = initialFiles
    .filter(f => f.fileTag === "Daily Recap")
    .sort((a, b) => {
      const da = a.recapDate ?? a.createdAt;
      const db = b.recapDate ?? b.createdAt;
      return db.localeCompare(da); // most recent first
    });

  const [files, setFiles] = useState<ProjectFile[]>(recapFiles);

  // Sync when initialFiles prop changes (parent re-renders after upload)
  // We compare by length + IDs to avoid unnecessary resets
  const handleSaved = (updated: ProjectFile) => {
    setFiles(prev => prev.map(f => f.id === updated.id ? updated : f));
  };

  if (files.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="flex items-center gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Daily Recaps</h2>
          <p className="text-sm text-gray-500 mt-0.5">AI-transcribed handwritten notes from the field</p>
        </div>
        <span className="ml-auto text-xs text-gray-400 font-medium">{files.length} recap{files.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="space-y-4">
        {files.map(f => (
          <RecapCard
            key={f.id}
            file={f}
            canEdit={canEdit}
            onSaved={updated => {
              handleSaved(updated);
              setFiles(prev => [...prev].sort((a, b) => {
                const da = (a.id === updated.id ? updated.recapDate : a.recapDate) ?? a.createdAt;
                const db = (b.id === updated.id ? updated.recapDate : b.recapDate) ?? b.createdAt;
                return db.localeCompare(da);
              }));
            }}
          />
        ))}
      </div>
    </section>
  );
}
