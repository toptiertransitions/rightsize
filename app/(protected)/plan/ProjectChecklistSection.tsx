"use client";

import { useState, useRef, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ProjectTask } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  tenantId: string;
  isAdmin: boolean;
  isManager: boolean;
  currentUserName: string;
  initialTasks: ProjectTask[];
}

// ─── Task form modal ──────────────────────────────────────────────────────────

interface TaskModalProps {
  tenantId: string;
  task?: ProjectTask | null;
  maxSortOrder: number;
  onSaved: (task: ProjectTask) => void;
  onClose: () => void;
}

function TaskModal({ tenantId, task, maxSortOrder, onSaved, onClose }: TaskModalProps) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!title.trim()) { setError("Title is required."); return; }
    setSaving(true);
    setError("");
    try {
      if (task) {
        const res = await fetch(`/api/plan/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim(), dueDate: dueDate || null, notes }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to save");
        onSaved(data.task);
      } else {
        const res = await fetch("/api/plan/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId, title: title.trim(), dueDate: dueDate || undefined, sortOrder: maxSortOrder + 1, notes }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create");
        onSaved(data.task);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-gray-900 mb-4">
          {task ? "Edit Task" : "Add Task"}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Task Title <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              placeholder="e.g. Schedule furniture movers"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Due Date <span className="text-gray-400">(optional)</span></label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes <span className="text-gray-400">(optional)</span></label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 resize-none"
              placeholder="Any additional context…"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 h-9 bg-forest-600 text-white text-sm font-medium rounded-lg hover:bg-forest-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : task ? "Save Changes" : "Add Task"}
          </button>
          <button
            onClick={onClose}
            className="h-9 px-4 border border-gray-300 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Due date badge ───────────────────────────────────────────────────────────

function DueDateBadge({ dateStr }: { dateStr: string }) {
  const date = new Date(dateStr + "T12:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isPast = date < today;
  const isToday = date.toDateString() === today.toDateString();
  const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const cls = isToday
    ? "bg-amber-100 text-amber-700"
    : isPast
    ? "bg-red-100 text-red-600"
    : "bg-gray-100 text-gray-500";

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      {label}
    </span>
  );
}

// ─── Drag handle icon ─────────────────────────────────────────────────────────

function DragHandle(props: React.HTMLAttributes<SVGSVGElement>) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`w-4 h-4 text-gray-300 cursor-grab active:cursor-grabbing hover:text-gray-400 flex-shrink-0 ${props.className ?? ""}`}
    >
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

// ─── Task row (sortable) ──────────────────────────────────────────────────────

interface TaskRowProps {
  task: ProjectTask;
  isAdmin: boolean;
  isManager: boolean;
  tenantId: string;
  onToggleComplete: (task: ProjectTask) => void;
  onEdit: (task: ProjectTask) => void;
  onDelete: (taskId: string) => void;
  onAttachmentUploaded: (task: ProjectTask) => void;
  completing: boolean;
}

function TaskRow({
  task,
  isAdmin,
  isManager,
  tenantId,
  onToggleComplete,
  onEdit,
  onDelete,
  onAttachmentUploaded,
  completing,
}: TaskRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, disabled: !isAdmin });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isComplete = task.status === "Completed";

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tenantId", tenantId);
      const res = await fetch(`/api/plan/tasks/${task.id}/attachment`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onAttachmentUploaded(data.task);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${task.title}"?`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/plan/tasks/${task.id}`, { method: "DELETE" });
      onDelete(task.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-start gap-3 px-3 py-3 rounded-xl border transition-all ${
        isDragging
          ? "bg-white shadow-lg border-forest-200 opacity-80"
          : isComplete
          ? "bg-gray-50 border-transparent"
          : "bg-white border-gray-100 hover:border-gray-200"
      }`}
    >
      {/* Drag handle */}
      {isAdmin && !isComplete && (
        <div {...attributes} {...listeners} className="mt-0.5 touch-none">
          <DragHandle />
        </div>
      )}
      {(!isAdmin || isComplete) && <div className="w-4 flex-shrink-0" />}

      {/* Checkbox */}
      <button
        onClick={() => !completing && onToggleComplete(task)}
        disabled={completing || (!isAdmin && !isManager)}
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
          isComplete
            ? "bg-forest-600 border-forest-600"
            : "border-gray-300 hover:border-forest-400"
        } ${(!isAdmin && !isManager) ? "cursor-default" : "cursor-pointer"}`}
        aria-label={isComplete ? "Mark open" : "Mark complete"}
      >
        {isComplete && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-snug ${isComplete ? "line-through text-gray-400" : "text-gray-800"}`}>
          {task.title}
        </p>
        {task.notes && !isComplete && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{task.notes}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {task.dueDate && <DueDateBadge dateStr={task.dueDate} />}
          {isComplete && task.completedBy && (
            <span className="text-[11px] text-gray-400">
              Completed by {task.completedBy}{task.completedAt ? ` · ${new Date(task.completedAt + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
            </span>
          )}
          {task.attachmentUrl && (
            <a
              href={task.attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-forest-600 hover:text-forest-800 font-medium"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              {task.attachmentName || "Attachment"}
            </a>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* File upload (manager+) */}
        {(isAdmin || isManager) && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title={task.attachmentUrl ? "Replace attachment" : "Attach file"}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
            >
              {uploading ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              )}
            </button>
          </>
        )}

        {/* Edit (admin only) */}
        {isAdmin && (
          <button
            onClick={() => onEdit(task)}
            title="Edit task"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}

        {/* Delete (admin only) */}
        {isAdmin && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Delete task"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

export function ProjectChecklistSection({ tenantId, isAdmin, isManager, currentUserName, initialTasks }: Props) {
  const [tasks, setTasks] = useState<ProjectTask[]>(initialTasks);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const openTasks = tasks.filter(t => t.status === "Open").sort((a, b) => a.sortOrder - b.sortOrder);
  const completedTasks = tasks.filter(t => t.status === "Completed").sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""));

  const maxSortOrder = openTasks.length > 0 ? Math.max(...openTasks.map(t => t.sortOrder)) : -1;

  const handleSaved = useCallback((task: ProjectTask) => {
    setTasks(prev => {
      const exists = prev.find(t => t.id === task.id);
      return exists ? prev.map(t => t.id === task.id ? task : t) : [...prev, task];
    });
  }, []);

  const handleDelete = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }, []);

  const handleToggleComplete = useCallback(async (task: ProjectTask) => {
    const newStatus = task.status === "Open" ? "Completed" : "Open";
    setCompletingId(task.id);
    try {
      const res = await fetch(`/api/plan/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          completedAt: newStatus === "Completed"
            ? new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })
            : "",
          completedBy: newStatus === "Completed" ? currentUserName : "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTasks(prev => prev.map(t => t.id === task.id ? data.task : t));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update task");
    } finally {
      setCompletingId(null);
    }
  }, [currentUserName]);

  const handleAttachmentUploaded = useCallback((task: ProjectTask) => {
    setTasks(prev => prev.map(t => t.id === task.id ? task : t));
  }, []);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = openTasks.findIndex(t => t.id === active.id);
    const newIndex = openTasks.findIndex(t => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(openTasks, oldIndex, newIndex);
    const orderedIds = reordered.map(t => t.id);

    // Optimistic update
    setTasks(prev => {
      const completed = prev.filter(t => t.status === "Completed");
      const updated = reordered.map((t, i) => ({ ...t, sortOrder: i }));
      return [...updated, ...completed];
    });

    // Persist
    fetch("/api/plan/tasks/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    }).catch(() => {
      // Revert on failure
      setTasks(initialTasks);
    });
  }

  return (
    <div className="mt-10 pt-8 border-t border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-3 group"
        >
          <div className="w-8 h-8 rounded-lg bg-forest-50 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <div className="text-left">
            <h2 className="text-base font-semibold text-gray-900 group-hover:text-forest-700 transition-colors">
              Project Checklist
              {tasks.length > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {openTasks.length} open{completedTasks.length > 0 ? ` · ${completedTasks.length} done` : ""}
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-400">Internal — visible to managers and admins only</p>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${collapsed ? "" : "rotate-180"}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isAdmin && !collapsed && (
          <button
            onClick={() => { setEditingTask(null); setShowModal(true); }}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Task
          </button>
        )}
      </div>

      {!collapsed && (
        <div>
          {/* Open tasks */}
          {openTasks.length === 0 && completedTasks.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <svg className="w-8 h-8 mx-auto mb-2 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm">{isAdmin ? "No tasks yet — click Add Task to get started." : "No tasks yet."}</p>
            </div>
          )}

          {openTasks.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={openTasks.map(t => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1">
                  {openTasks.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      isAdmin={isAdmin}
                      isManager={isManager}
                      tenantId={tenantId}
                      onToggleComplete={handleToggleComplete}
                      onEdit={t => { setEditingTask(t); setShowModal(true); }}
                      onDelete={handleDelete}
                      onAttachmentUploaded={handleAttachmentUploaded}
                      completing={completingId === task.id}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {/* Completed tasks */}
          {completedTasks.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2 px-3">
                <div className="h-px flex-1 bg-gray-100" />
                <span className="text-xs text-gray-400 font-medium">Completed ({completedTasks.length})</span>
                <div className="h-px flex-1 bg-gray-100" />
              </div>
              <div className="space-y-1">
                {completedTasks.map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    isAdmin={isAdmin}
                    isManager={isManager}
                    tenantId={tenantId}
                    onToggleComplete={handleToggleComplete}
                    onEdit={t => { setEditingTask(t); setShowModal(true); }}
                    onDelete={handleDelete}
                    onAttachmentUploaded={handleAttachmentUploaded}
                    completing={completingId === task.id}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <TaskModal
          tenantId={tenantId}
          task={editingTask}
          maxSortOrder={maxSortOrder}
          onSaved={handleSaved}
          onClose={() => { setShowModal(false); setEditingTask(null); }}
        />
      )}
    </div>
  );
}
