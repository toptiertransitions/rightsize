"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { ContentItem, ContentCategory } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type CalView = "month" | "week" | "list";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  return addDays(d, -day);
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function weekLabel(d: Date): string {
  const start = startOfWeek(d);
  const end = addDays(start, 6);
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function formatDayFull(iso: string): string {
  return parseDate(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// ─── Content Pill ─────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, string> = {
  PDF: "📄", Image: "🖼", PartnerLogo: "🏢", URL: "🔗", LinkedIn: "💼",
};

function ContentPill({ item, category, compact, onClick }: {
  item: ContentItem;
  category?: ContentCategory;
  compact?: boolean;
  onClick: () => void;
}) {
  const color = category?.color ?? "#6b7280";
  const today = toISO(new Date());
  const isAvailable = !item.scheduledDate || item.scheduledDate <= today;

  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      className={cn(
        "w-full text-left px-2 py-0.5 rounded-md text-xs font-medium border-l-2 transition-all hover:opacity-90 group",
        compact ? "truncate" : "flex items-center gap-1.5"
      )}
      style={{ background: color + "18", borderLeftColor: color, color }}
      title={item.title}
    >
      <span className="flex-shrink-0">{TYPE_ICONS[item.contentType] ?? "📌"}</span>
      <span className={cn("flex-1", compact ? "truncate block" : "truncate")}>{item.title}</span>
      {!isAvailable && (
        <svg className="w-3 h-3 flex-shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      )}
    </button>
  );
}

// ─── Quick Add Modal ──────────────────────────────────────────────────────────

function QuickAddModal({ date, categories, onClose, onCreated }: {
  date: Date;
  categories: ContentCategory[];
  onClose: () => void;
  onCreated: (item: ContentItem) => void;
}) {
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/content/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          categoryId: categoryId || undefined,
          scheduledDate: toISO(date),
          contentType: "PDF",
          audience: "Both",
          pipelineStage: "All",
          status: "Draft",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.item) { setError(data.error ?? "Failed to create"); return; }
      onCreated(data.item);
      onClose();
    } catch {
      setError("Unexpected error — try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">{date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
            <h3 className="text-sm font-semibold text-gray-900">Quick Add to Calendar</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Title *</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              placeholder="e.g. LinkedIn Post — Q3 Market Update"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-forest-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Category <span className="font-normal normal-case text-gray-400">(optional)</span></label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-forest-500"
            >
              <option value="">No category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 text-sm text-gray-700 rounded-xl hover:bg-gray-50 transition-colors">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || saving}
            className="flex-1 px-4 py-2.5 bg-forest-600 text-white text-sm font-medium rounded-xl hover:bg-forest-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Adding…" : "Add to Calendar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Day Cell (month view) ────────────────────────────────────────────────────

function DayCell({
  date, isCurrentMonth, items, categories, isAdmin, onClickDay, onDropItem, onItemClick, onQuickAdd,
}: {
  date: Date;
  isCurrentMonth: boolean;
  items: ContentItem[];
  categories: Map<string, ContentCategory>;
  isAdmin: boolean;
  onClickDay: (date: Date) => void;
  onDropItem: (itemId: string, date: string) => void;
  onItemClick: (item: ContentItem) => void;
  onQuickAdd: (date: Date) => void;
}) {
  const iso = toISO(date);
  const today = toISO(new Date());
  const isToday = iso === today;
  const isPast = iso < today;

  const [dragOver, setDragOver] = useState(false);

  const visible = items.slice(0, 3);
  const overflow = items.length - 3;

  return (
    <div
      className={cn(
        "min-h-[100px] p-1.5 border-b border-r border-gray-100 transition-colors",
        isCurrentMonth ? "bg-white" : "bg-gray-50/60",
        isPast && isCurrentMonth ? "bg-white" : "",
        dragOver && isAdmin ? "bg-forest-50 ring-2 ring-forest-400 ring-inset" : ""
      )}
      onDragOver={isAdmin ? e => { e.preventDefault(); setDragOver(true); } : undefined}
      onDragLeave={isAdmin ? () => setDragOver(false) : undefined}
      onDrop={isAdmin ? e => {
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData("contentItemId");
        if (id) onDropItem(id, iso);
      } : undefined}
      onClick={() => onClickDay(date)}
    >
      {/* Day number */}
      <div className="flex items-center justify-between mb-1 group/day">
        <span className={cn(
          "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
          isToday ? "bg-forest-600 text-white font-bold" : isCurrentMonth ? "text-gray-700" : "text-gray-300"
        )}>
          {date.getDate()}
        </span>
        <div className="flex items-center gap-1">
          {items.length > 0 && (
            <span className="text-xs text-gray-400 font-medium">{items.length}</span>
          )}
          {isAdmin && (
            <button
              onClick={e => { e.stopPropagation(); onQuickAdd(date); }}
              className="opacity-0 group-hover/day:opacity-100 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-forest-600 hover:bg-forest-50 transition-all text-base leading-none"
              title="Quick add"
            >
              +
            </button>
          )}
        </div>
      </div>
      {/* Pills */}
      <div className="space-y-0.5">
        {visible.map(item => (
          <ContentPill key={item.id} item={item} category={item.categoryId ? categories.get(item.categoryId) : undefined} compact onClick={() => onItemClick(item)} />
        ))}
        {overflow > 0 && (
          <button onClick={e => { e.stopPropagation(); onClickDay(date); }}
            className="text-xs text-gray-400 hover:text-forest-600 pl-2 transition-colors">
            +{overflow} more
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Item Detail Slideout ─────────────────────────────────────────────────────

function ItemDetailSlideout({ item, category, onClose, isAdmin, onEditInRepository, onReschedule, onViewInRepository }: {
  item: ContentItem;
  category?: ContentCategory;
  onClose: () => void;
  isAdmin: boolean;
  onEditInRepository?: (item: ContentItem) => void;
  onReschedule: (date: string | null) => void;
  onViewInRepository?: () => void;
}) {
  const color = category?.color ?? "#6b7280";
  const today = toISO(new Date());
  const isAvailable = !item.scheduledDate || item.scheduledDate <= today;
  const url = item.fileUrl || item.linkUrl;
  const hasContent = !!(item.fileUrl || item.linkUrl);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-80 bg-white h-full shadow-2xl flex flex-col overflow-y-auto border-l border-gray-100">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 truncate">{item.contentType}</p>
          </div>
          {isAdmin && onEditInRepository && (
            <button
              onClick={() => { onClose(); onEditInRepository(item); }}
              className="text-xs text-forest-600 hover:text-forest-700 font-medium flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>
          )}
        </div>
        <div className="p-5 flex flex-col gap-4">
          {/* Category badge + title */}
          <div>
            {category && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full mb-2 text-white" style={{ background: color }}>
                {category.name}
              </span>
            )}
            <h3 className="text-base font-bold text-gray-900 leading-tight">{item.title}</h3>
            {item.description && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{item.description}</p>}
          </div>

          {/* Availability */}
          <div className={cn("flex items-center gap-2 text-xs px-3 py-2 rounded-xl", isAvailable ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700")}>
            {isAvailable
              ? <><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Available now</>
              : <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>Available {formatDayFull(item.scheduledDate!)}</>
            }
          </div>

          {/* Stats */}
          <div className="flex gap-4">
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">{item.downloadCount}</p>
              <p className="text-xs text-gray-400">Downloads</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">{item.likeCount}</p>
              <p className="text-xs text-gray-400">Likes</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">{item.commentCount}</p>
              <p className="text-xs text-gray-400">Comments</p>
            </div>
          </div>

          {/* Tags */}
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {item.tags.map(t => <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>)}
            </div>
          )}

          {/* Reschedule (admin) */}
          {isAdmin && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Scheduled Date</label>
              <div className="flex gap-2">
                <input type="date" defaultValue={item.scheduledDate ?? ""} id={`reschedule-${item.id}`}
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-forest-500" />
                <button
                  onClick={() => {
                    const input = document.getElementById(`reschedule-${item.id}`) as HTMLInputElement;
                    onReschedule(input?.value || null);
                  }}
                  className="px-3 py-2 bg-forest-600 text-white text-xs rounded-xl hover:bg-forest-700 transition-colors">
                  Set
                </button>
              </div>
              {item.scheduledDate && (
                <button onClick={() => onReschedule(null)} className="text-xs text-red-500 hover:text-red-600 mt-1.5 transition-colors">
                  Remove from calendar
                </button>
              )}
            </div>
          )}

          {/* Upload Content — shown when no file/link yet (e.g. Quick Add drafts) */}
          {isAdmin && !hasContent && onEditInRepository && (
            <button
              onClick={() => { onClose(); onEditInRepository(item); }}
              className="flex items-center justify-center gap-2 bg-amber-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-amber-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload Content
            </button>
          )}
          {isAdmin && !hasContent && !onEditInRepository && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-center">
              No file or link attached yet. Edit this item in the Content Repository to upload content.
            </p>
          )}

          {/* Download / Open Link */}
          {url && isAvailable && (
            <a href={url} target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-2 bg-forest-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-forest-700 transition-colors">
              {item.fileUrl ? (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Download</>
              ) : (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>Open Link</>
              )}
            </a>
          )}
          {url && !isAvailable && (
            <div className="text-center text-sm text-gray-400 py-2">
              Content available on {item.scheduledDate ? parseDate(item.scheduledDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "scheduled date"}
            </div>
          )}

          {/* View in Repository */}
          {onViewInRepository && hasContent && (
            <button
              onClick={onViewInRepository}
              className="flex items-center justify-center gap-2 border border-forest-200 text-forest-700 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-forest-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>
              View in Repository
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Day Expanded Modal ───────────────────────────────────────────────────────

function DayExpandedModal({ date, items, categories, onClose, onItemClick }: {
  date: Date;
  items: ContentItem[];
  categories: Map<string, ContentCategory>;
  onClose: () => void;
  onItemClick: (item: ContentItem) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[70vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">{date.toLocaleDateString("en-US", { weekday: "long" })}</p>
            <p className="text-base font-bold text-gray-900">
              {date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-5 space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No content scheduled for this day.</p>
          ) : items.map(item => (
            <button key={item.id} onClick={() => { onClose(); onItemClick(item); }}
              className="w-full text-left p-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all flex items-center gap-3">
              <span className="text-xl">{TYPE_ICONS[item.contentType] ?? "📌"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                {item.categoryId && categories.get(item.categoryId) && (
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: categories.get(item.categoryId)!.color }} />
                    {categories.get(item.categoryId)!.name}
                  </p>
                )}
              </div>
              <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main ContentCalendar Component ───────────────────────────────────────────

interface Props {
  isAdmin: boolean;
  onViewInRepository?: (item: ContentItem) => void;
  onEditInRepository?: (item: ContentItem) => void;
}

export default function ContentCalendar({ isAdmin, onViewInRepository, onEditInRepository }: Props) {
  const [view, setView] = useState<CalView>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [items, setItems] = useState<ContentItem[]>([]);
  const [categories, setCategories] = useState<ContentCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [expandedDay, setExpandedDay] = useState<Date | null>(null);
  const [catFilter, setCatFilter] = useState<string | "All">("All");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [quickAddDate, setQuickAddDate] = useState<Date | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [itemsRes, catsRes] = await Promise.all([
      fetch("/api/content/items?status=active_draft").then(r => r.json()),
      fetch("/api/content/categories").then(r => r.json()),
    ]);
    setItems((itemsRes.items ?? []).filter((i: ContentItem) => i.scheduledDate));
    setCategories(catsRes.categories ?? []);
    setLoading(false);
  }

  async function rescheduleItem(itemId: string, newDate: string | null) {
    const res = await fetch(`/api/content/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledDate: newDate }),
    });
    const data = await res.json();
    if (newDate) {
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, scheduledDate: newDate } : i));
    } else {
      setItems(prev => prev.filter(i => i.id !== itemId));
    }
    if (selectedItem?.id === itemId) setSelectedItem(prev => prev ? { ...prev, scheduledDate: newDate ?? undefined } : prev);
  }

  const catMap = new Map(categories.map(c => [c.id, c]));

  const filteredItems = catFilter === "All" ? items : items.filter(i => i.categoryId === catFilter);

  function itemsForDate(iso: string): ContentItem[] {
    return filteredItems.filter(i => i.scheduledDate === iso);
  }

  // ── Navigation ──────────────────────────────────────────────────────────────
  function navigate(dir: -1 | 1) {
    setCurrentDate(prev => {
      if (view === "month") return new Date(prev.getFullYear(), prev.getMonth() + dir, 1);
      if (view === "week") return addDays(prev, dir * 7);
      return addDays(prev, dir);
    });
  }

  const navLabel = view === "month" ? monthLabel(currentDate) : view === "week" ? weekLabel(currentDate) : currentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  // ── Month grid ──────────────────────────────────────────────────────────────
  function renderMonthGrid() {
    const start = startOfWeek(startOfMonth(currentDate));
    const end = addDays(startOfWeek(endOfMonth(currentDate)), 6);
    const days: Date[] = [];
    let d = start;
    while (d <= end) { days.push(d); d = addDays(d, 1); }

    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
          {DAYS_OF_WEEK.map(day => (
            <div key={day} className="py-2 text-center text-xs font-semibold text-gray-500">{day}</div>
          ))}
        </div>
        {/* Day cells */}
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const iso = toISO(day);
            const dayItems = itemsForDate(iso);
            return (
              <DayCell
                key={i}
                date={day}
                isCurrentMonth={day.getMonth() === currentDate.getMonth()}
                items={dayItems}
                categories={catMap}
                isAdmin={isAdmin}
                onClickDay={date => {
                  const iso2 = toISO(date);
                  if (itemsForDate(iso2).length > 3 || itemsForDate(iso2).length > 0) {
                    setExpandedDay(date);
                  }
                }}
                onDropItem={rescheduleItem}
                onItemClick={setSelectedItem}
                onQuickAdd={setQuickAddDate}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // ── Week grid ───────────────────────────────────────────────────────────────
  function renderWeekGrid() {
    const start = startOfWeek(currentDate);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const today = toISO(new Date());

    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-200">
          {days.map((day, i) => {
            const iso = toISO(day);
            const isToday = iso === today;
            const dayItems = itemsForDate(iso);
            return (
              <div key={i} className="border-r border-gray-100 last:border-r-0">
                <div className={cn("py-3 text-center border-b border-gray-100 group/wday relative", isToday ? "bg-forest-50" : "bg-gray-50")}>
                  <p className="text-xs text-gray-400">{DAYS_OF_WEEK[day.getDay()]}</p>
                  <p className={cn("text-sm font-bold w-8 h-8 flex items-center justify-center rounded-full mx-auto",
                    isToday ? "bg-forest-600 text-white" : "text-gray-800")}>{day.getDate()}</p>
                  {isAdmin && (
                    <button
                      onClick={() => setQuickAddDate(day)}
                      className="opacity-0 group-hover/wday:opacity-100 absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-forest-600 hover:bg-forest-50 transition-all text-base leading-none"
                      title="Quick add"
                    >
                      +
                    </button>
                  )}
                </div>
                <div
                  className={cn("min-h-[200px] p-2 space-y-1", isAdmin ? "cursor-default" : "")}
                  onDragOver={isAdmin ? e => e.preventDefault() : undefined}
                  onDrop={isAdmin ? e => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("contentItemId");
                    if (id) rescheduleItem(id, iso);
                  } : undefined}
                >
                  {dayItems.map(item => (
                    <div
                      key={item.id}
                      draggable={isAdmin}
                      onDragStart={isAdmin ? e => { e.dataTransfer.setData("contentItemId", item.id); setDraggingId(item.id); } : undefined}
                      onDragEnd={isAdmin ? () => setDraggingId(null) : undefined}
                      className={cn("transition-opacity", draggingId === item.id ? "opacity-40" : "")}
                    >
                      <ContentPill item={item} category={item.categoryId ? catMap.get(item.categoryId) : undefined} onClick={() => setSelectedItem(item)} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── List view ───────────────────────────────────────────────────────────────
  function renderListView() {
    const sorted = [...filteredItems].sort((a, b) => (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? ""));
    const today = toISO(new Date());

    const grouped: Record<string, ContentItem[]> = {};
    for (const item of sorted) {
      const key = item.scheduledDate ?? "";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    }

    if (sorted.length === 0) return (
      <div className="py-16 text-center text-sm text-gray-400">No content scheduled yet.</div>
    );

    return (
      <div className="space-y-1">
        {Object.entries(grouped).map(([iso, groupItems]) => {
          const isPast = iso < today;
          return (
            <div key={iso}>
              <div className={cn("flex items-center gap-3 py-2 px-1")}>
                <div className={cn("flex-shrink-0 w-24 text-right text-xs font-semibold", isPast ? "text-gray-400" : iso === today ? "text-forest-700" : "text-gray-700")}>
                  {iso === today ? "Today" : parseDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
                <div className="flex-1 bg-white rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
                  {groupItems.map(item => {
                    const cat = item.categoryId ? catMap.get(item.categoryId) : undefined;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSelectedItem(item)}
                        draggable={isAdmin}
                        onDragStart={isAdmin ? e => e.dataTransfer.setData("contentItemId", item.id) : undefined}
                        className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-base">{TYPE_ICONS[item.contentType] ?? "📌"}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                          {item.description && <p className="text-xs text-gray-400 truncate">{item.description}</p>}
                        </div>
                        {cat && (
                          <span className="flex items-center gap-1.5 text-xs text-gray-500 flex-shrink-0">
                            <span className="w-2 h-2 rounded-full" style={{ background: cat.color }} />{cat.name}
                          </span>
                        )}
                        <div className="flex items-center gap-2 text-xs text-gray-400 flex-shrink-0">
                          <span>↓{item.downloadCount}</span>
                          <span>♡{item.likeCount}</span>
                        </div>
                        <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Nav */}
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            Today
          </button>
          <button onClick={() => navigate(1)} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          <h2 className="text-base font-bold text-gray-900 ml-1 min-w-[200px]">{navLabel}</h2>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Upload shortcut — takes admin directly to Content Repository upload form */}
          {isAdmin && onEditInRepository && (
            <button
              onClick={() => { onEditInRepository({ id: "__new__" } as ContentItem); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-forest-700 border border-forest-200 rounded-xl hover:bg-forest-50 transition-colors"
              title="Upload new content to the Repository"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload Content
            </button>
          )}

          {/* View toggle */}
          <div className="flex rounded-xl border border-gray-200 overflow-hidden">
            {(["month", "week", "list"] as CalView[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={cn("px-3 py-1.5 text-xs font-medium capitalize transition-colors", view === v ? "bg-forest-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Category filter + legend */}
      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setCatFilter("All")}
            className={cn("flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border transition-colors", catFilter === "All" ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300")}>
            All Categories
          </button>
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setCatFilter(catFilter === cat.id ? "All" : cat.id)}
              className={cn("flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border transition-all", catFilter === cat.id ? "text-white border-transparent" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300")}
              style={catFilter === cat.id ? { background: cat.color, borderColor: cat.color } : {}}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat.color }} />
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Calendar */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 h-96 animate-pulse" />
      ) : view === "month" ? renderMonthGrid()
        : view === "week" ? renderWeekGrid()
        : renderListView()
      }

      {/* Unscheduled queue (admin) */}
      {isAdmin && (
        <UnscheduledQueue allItems={items} catMap={catMap} onDragStart={setDraggingId} />
      )}

      {/* Item detail */}
      {selectedItem && (
        <ItemDetailSlideout
          item={selectedItem}
          category={selectedItem.categoryId ? catMap.get(selectedItem.categoryId) : undefined}
          onClose={() => setSelectedItem(null)}
          isAdmin={isAdmin}
          onEditInRepository={onEditInRepository ? (item) => {
            setSelectedItem(null);
            onEditInRepository(item);
          } : undefined}
          onReschedule={async (date) => { await rescheduleItem(selectedItem.id, date); }}
          onViewInRepository={onViewInRepository && (selectedItem.fileUrl || selectedItem.linkUrl) ? () => {
            setSelectedItem(null);
            onViewInRepository(selectedItem);
          } : undefined}
        />
      )}

      {/* Quick add modal */}
      {isAdmin && quickAddDate && (
        <QuickAddModal
          date={quickAddDate}
          categories={categories}
          onClose={() => setQuickAddDate(null)}
          onCreated={item => {
            setItems(prev => [...prev, item]);
            setQuickAddDate(null);
          }}
        />
      )}

      {/* Day expanded modal */}
      {expandedDay && (
        <DayExpandedModal
          date={expandedDay}
          items={itemsForDate(toISO(expandedDay))}
          categories={catMap}
          onClose={() => setExpandedDay(null)}
          onItemClick={setSelectedItem}
        />
      )}
    </div>
  );
}

// ─── Unscheduled Queue ────────────────────────────────────────────────────────

function UnscheduledQueue({ allItems, catMap, onDragStart }: {
  allItems: ContentItem[];
  catMap: Map<string, ContentCategory>;
  onDragStart: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const unscheduled = allItems.filter(i => !i.scheduledDate).slice(0, 20);
  if (unscheduled.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          <span className="text-sm font-semibold text-gray-700">Unscheduled Content</span>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{unscheduled.length}</span>
        </div>
        <svg className={cn("w-4 h-4 text-gray-400 transition-transform", expanded ? "rotate-180" : "")} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {expanded && (
        <div className="border-t border-gray-100 p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {unscheduled.map(item => {
            const cat = item.categoryId ? catMap.get(item.categoryId) : undefined;
            const color = cat?.color ?? "#6b7280";
            return (
              <div
                key={item.id}
                draggable
                onDragStart={e => { e.dataTransfer.setData("contentItemId", item.id); onDragStart(item.id); }}
                className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 hover:border-gray-200 cursor-grab active:cursor-grabbing bg-white hover:shadow-sm transition-all"
              >
                <span className="text-sm">{TYPE_ICONS[item.contentType] ?? "📌"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{item.title}</p>
                  {cat && <p className="text-xs text-gray-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: color }} />{cat.name}</p>}
                </div>
                <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
              </div>
            );
          })}
          <p className="col-span-full text-xs text-gray-400 text-center mt-1">Drag items to a calendar day to schedule them</p>
        </div>
      )}
    </div>
  );
}
