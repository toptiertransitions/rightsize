"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReplyItem {
  enrollmentId: string;
  contactName: string;
  contactEmail: string;
  company: string;
  sequenceName: string;
  currentStep: number;
  lastReplyAt: string;
  lastReplySnippet: string;
}

interface TaskItem {
  enrollmentId: string;
  contactName: string;
  contactEmail: string;
  company: string;
  sequenceName: string;
  totalSteps: number;
  currentStep: number;
  taskTitle: string;
  taskDescription: string;
  taskType: string;
  nextSendAt: string;
  isOverdue: boolean;
}

interface WeekDay {
  date: string;
  label: string;
  taskCount: number;
  emailCount: number;
}

interface MyDayData {
  repliesWaiting: ReplyItem[];
  tasksDue: TaskItem[];
  autosendingTodayCount: number;
  overdueCount: number;
  thisWeek: WeekDay[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function timeAgo(iso: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Summary cards ────────────────────────────────────────────────────────────

function SummaryCard({
  count, label, color, sub,
}: { count: number; label: string; color: string; sub?: string }) {
  return (
    <div className={cn("rounded-xl border p-4", color)}>
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-sm font-medium mt-0.5">{label}</div>
      {sub && <div className="text-xs mt-1 opacity-70">{sub}</div>}
    </div>
  );
}

// ─── Reply card ───────────────────────────────────────────────────────────────

function ReplyCard({
  item, onAcknowledge, onResume,
}: {
  item: ReplyItem;
  onAcknowledge: (id: string) => void;
  onResume: (id: string) => void;
}) {
  const [acting, setActing] = useState(false);

  async function handle(action: "acknowledge" | "resume") {
    setActing(true);
    await fetch("/api/outreach/enrollments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.enrollmentId, action }),
    });
    if (action === "acknowledge") onAcknowledge(item.enrollmentId);
    else onResume(item.enrollmentId);
    setActing(false);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900">{item.contactName}</span>
            {item.company && (
              <span className="text-xs text-gray-400">· {item.company}</span>
            )}
            <span className="text-xs text-gray-400">{timeAgo(item.lastReplyAt)}</span>
          </div>
          <div className="mt-1 text-xs text-gray-500">{item.sequenceName} · Step {item.currentStep}</div>
          {item.lastReplySnippet && (
            <p className="mt-2 text-sm text-gray-700 italic line-clamp-2">&ldquo;{item.lastReplySnippet}&rdquo;</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            disabled={acting}
            onClick={() => handle("acknowledge")}
            className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Dismiss
          </button>
          <button
            disabled={acting}
            onClick={() => handle("resume")}
            className="rounded-md bg-forest-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-forest-700 disabled:opacity-50 transition-colors"
          >
            Resume
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Snooze picker ────────────────────────────────────────────────────────────

function SnoozePicker({ onSnooze, onCancel }: { onSnooze: (date: string) => void; onCancel: () => void }) {
  const tomorrow = new Date(Date.now() + 86400000);
  const in2 = new Date(Date.now() + 2 * 86400000);
  const in7 = new Date(Date.now() + 7 * 86400000);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const fmtLabel = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="absolute right-0 top-8 z-20 w-48 rounded-lg border border-gray-200 bg-white shadow-lg py-1">
      {[
        { label: `Tomorrow (${fmtLabel(tomorrow)})`, val: fmt(tomorrow) },
        { label: `In 2 days (${fmtLabel(in2)})`, val: fmt(in2) },
        { label: `Next week (${fmtLabel(in7)})`, val: fmt(in7) },
      ].map(opt => (
        <button
          key={opt.val}
          onClick={() => onSnooze(opt.val)}
          className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
        >
          {opt.label}
        </button>
      ))}
      <hr className="my-1 border-gray-100" />
      <button onClick={onCancel} className="block w-full px-4 py-2 text-left text-sm text-gray-400 hover:bg-gray-50">
        Cancel
      </button>
    </div>
  );
}

// ─── Task card ────────────────────────────────────────────────────────────────

const TASK_TYPE_ICONS: Record<string, string> = {
  "LinkedIn": "💼",
  "Handwritten Note": "✉️",
  "Custom": "✅",
  "SMS": "💬",
  "Drop In": "🚪",
};

function TaskCard({
  item, onDone, onSkip, onSnooze,
}: {
  item: TaskItem;
  onDone: (id: string) => void;
  onSkip: (id: string) => void;
  onSnooze: (id: string, date: string) => void;
}) {
  const [acting, setActing] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);

  async function handleAction(action: "done" | "skip") {
    setActing(true);
    await fetch("/api/outreach/enrollments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.enrollmentId, action }),
    });
    if (action === "done") onDone(item.enrollmentId);
    else onSkip(item.enrollmentId);
    setActing(false);
  }

  async function handleSnooze(date: string) {
    setActing(true);
    setShowSnooze(false);
    await fetch("/api/outreach/enrollments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.enrollmentId, action: "snooze", snoozeDate: date }),
    });
    onSnooze(item.enrollmentId, date);
    setActing(false);
  }

  return (
    <div className={cn(
      "rounded-lg border bg-white p-4",
      item.isOverdue ? "border-red-200 bg-red-50" : "border-gray-200"
    )}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-lg leading-none w-6 shrink-0 text-center">
          {TASK_TYPE_ICONS[item.taskType] ?? "✅"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900 text-sm">{item.taskTitle}</span>
            {item.isOverdue && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                Overdue
              </span>
            )}
          </div>
          <div className="mt-0.5 text-sm text-gray-700">
            {item.contactName}
            {item.company && <span className="text-gray-400"> · {item.company}</span>}
          </div>
          <div className="mt-0.5 text-xs text-gray-400">
            {item.sequenceName} · Step {item.currentStep}/{item.totalSteps}
            {!item.isOverdue && item.nextSendAt && (
              <span className="ml-1">· Due {formatTime(item.nextSendAt)}</span>
            )}
          </div>
          {item.taskDescription && (
            <p className="mt-1.5 text-xs text-gray-500 line-clamp-2">{item.taskDescription}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0 relative">
          <button
            disabled={acting}
            onClick={() => handleAction("done")}
            className="rounded-md bg-forest-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-forest-700 disabled:opacity-50 transition-colors"
          >
            Done
          </button>
          <button
            disabled={acting}
            onClick={() => setShowSnooze(v => !v)}
            className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Snooze
          </button>
          <button
            disabled={acting}
            onClick={() => handleAction("skip")}
            className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-400 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Skip
          </button>
          {showSnooze && (
            <SnoozePicker onSnooze={handleSnooze} onCancel={() => setShowSnooze(false)} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default function MyDayTab() {
  const [data, setData] = useState<MyDayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [replies, setReplies] = useState<ReplyItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/outreach/my-day");
      const json: MyDayData = await res.json();
      setData(json);
      setReplies(json.repliesWaiting);
      setTasks(json.tasksDue);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function removeReply(id: string) {
    setReplies(prev => prev.filter(r => r.enrollmentId !== id));
    if (data) setData(d => d ? { ...d, repliesWaiting: d.repliesWaiting.filter(r => r.enrollmentId !== id) } : d);
  }

  function removeTask(id: string) {
    setTasks(prev => prev.filter(t => t.enrollmentId !== id));
    if (data) setData(d => d ? { ...d, tasksDue: d.tasksDue.filter(t => t.enrollmentId !== id), overdueCount: d.tasksDue.filter(t => t.enrollmentId !== id && t.isOverdue).length } : d);
  }

  function snoozeTask(id: string) {
    removeTask(id);
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-gray-400">Loading your day…</div>;
  }

  if (!data) {
    return <div className="py-16 text-center text-sm text-red-400">Failed to load. <button onClick={load} className="underline">Retry</button></div>;
  }

  return (
    <div className="space-y-8">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          count={replies.length}
          label="Replies Waiting"
          color="border-amber-200 bg-amber-50 text-amber-800"
          sub={replies.length > 0 ? "Need your attention" : "All clear"}
        />
        <SummaryCard
          count={tasks.length}
          label="Tasks Today"
          color={data.overdueCount > 0 ? "border-red-200 bg-red-50 text-red-800" : "border-forest-200 bg-forest-50 text-forest-800"}
          sub={data.overdueCount > 0 ? `${data.overdueCount} overdue` : "On track"}
        />
        <SummaryCard
          count={data.autosendingTodayCount}
          label="Auto-Sending"
          color="border-blue-200 bg-blue-50 text-blue-800"
          sub="Emails sending today"
        />
        <SummaryCard
          count={data.overdueCount}
          label="Overdue"
          color={data.overdueCount > 0 ? "border-red-200 bg-red-50 text-red-700" : "border-gray-200 bg-gray-50 text-gray-600"}
        />
      </div>

      {/* Replies waiting */}
      {replies.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white text-xs">{replies.length}</span>
            Replies Waiting
          </h2>
          <div className="space-y-3">
            {replies.map(r => (
              <ReplyCard
                key={r.enrollmentId}
                item={r}
                onAcknowledge={removeReply}
                onResume={removeReply}
              />
            ))}
          </div>
        </section>
      )}

      {/* Tasks today */}
      {tasks.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-forest-600 text-white text-xs">{tasks.length}</span>
            Tasks Today
          </h2>
          <div className="space-y-3">
            {tasks.map(t => (
              <TaskCard
                key={t.enrollmentId}
                item={t}
                onDone={removeTask}
                onSkip={removeTask}
                onSnooze={snoozeTask}
              />
            ))}
          </div>
        </section>
      ) : (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Tasks Today</h2>
          <div className="rounded-lg border border-dashed border-gray-200 py-10 text-center">
            <p className="text-sm text-gray-400">No tasks due today.</p>
          </div>
        </section>
      )}

      {/* This week preview */}
      {data.thisWeek.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">This Week</h2>
          <div className="grid grid-cols-7 gap-1.5">
            {data.thisWeek.map(day => (
              <div
                key={day.date}
                className={cn(
                  "rounded-lg border p-2 text-center text-xs",
                  day.label === "Today" ? "border-forest-300 bg-forest-50" : "border-gray-200 bg-white"
                )}
              >
                <div className={cn(
                  "font-medium mb-1",
                  day.label === "Today" ? "text-forest-700" : "text-gray-600"
                )}>
                  {day.label === "Today" || day.label === "Tomorrow"
                    ? day.label
                    : day.label.split(",")[0]}
                </div>
                {(day.taskCount > 0 || day.emailCount > 0) ? (
                  <div className="space-y-0.5">
                    {day.taskCount > 0 && (
                      <div className="rounded bg-forest-100 text-forest-700 px-1 py-0.5 text-xs">{day.taskCount}t</div>
                    )}
                    {day.emailCount > 0 && (
                      <div className="rounded bg-blue-100 text-blue-700 px-1 py-0.5 text-xs">{day.emailCount}e</div>
                    )}
                  </div>
                ) : (
                  <div className="text-gray-300">—</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
