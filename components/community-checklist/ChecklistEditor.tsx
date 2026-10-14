"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { dueRuleLabel, type ChecklistDueType, type ChecklistItem } from "@/lib/checklists/shared";

type Result = { ok: true; items: ChecklistItem[] } | { ok: false; error: string };

interface ItemDraft {
  id?: string;
  title: string;
  details: string;
  dueType: ChecklistDueType;
  dueDays: string; // text, empty for none (never a controlled 0)
  dueDate: string;
}

const EMPTY: ItemDraft = { title: "", details: "", dueType: "before", dueDays: "", dueDate: "" };

const RULES: { value: ChecklistDueType; label: string }[] = [
  { value: "before", label: "Days before move" },
  { value: "after", label: "Days after move" },
  { value: "date", label: "On a specific date" },
  { value: "none", label: "No due date" },
];

// The list of tasks a community sets for every resident. Due dates can be
// relative to each resident's move date, a fixed date, or none.
export function ChecklistEditor({
  theme,
  communityName,
  initialItems,
  onSave,
  onRemove,
  onReorder,
  onDone,
}: {
  theme: "light" | "dark";
  communityName: string;
  initialItems: ChecklistItem[];
  onSave: (input: { id?: string; title: string; details: string; dueType: ChecklistDueType; dueDays?: number; dueDate?: string }) => Promise<Result>;
  onRemove: (itemId: string) => Promise<Result>;
  onReorder: (ids: string[]) => Promise<Result>;
  /** Shows a "Done" button once there's at least one task */
  onDone?: () => void;
}) {
  const [items, setItems] = useState(initialItems);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const dark = theme === "dark";

  const t = {
    card: dark ? "bg-gray-900 border-gray-800" : "bg-white border-cream-200 shadow-sm",
    title: dark ? "text-white" : "text-gray-900",
    muted: dark ? "text-gray-400" : "text-gray-500",
    row: dark ? "border-gray-800" : "border-cream-100",
    input: dark
      ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-gray-500"
      : "bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20",
    primary: dark ? "bg-emerald-600 hover:bg-emerald-500" : "bg-forest-600 hover:bg-forest-700",
    secondary: dark ? "border-gray-700 text-gray-300 hover:bg-gray-800" : "border-gray-200 text-gray-700 hover:bg-gray-50",
    icon: dark ? "text-gray-500 hover:text-white hover:bg-gray-800" : "text-gray-400 hover:text-gray-800 hover:bg-gray-50",
    form: dark ? "bg-gray-950/60 border-gray-700" : "bg-cream-50 border-cream-200",
  };

  function run(fn: () => Promise<Result>, after?: () => void) {
    setError("");
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error);
      setItems(r.items);
      after?.();
    });
  }

  function saveDraft() {
    if (!draft) return;
    if (!draft.title.trim()) return setError("Give the task a name.");
    if (draft.dueType === "date" && !draft.dueDate) return setError("Pick the due date.");
    const days = draft.dueDays.trim() === "" ? 0 : Number(draft.dueDays);
    if ((draft.dueType === "before" || draft.dueType === "after") && (!Number.isFinite(days) || days < 0 || days > 730)) return setError("Enter a number of days from 0 to 730.");
    run(
      () => onSave({
        id: draft.id,
        title: draft.title.trim(),
        details: draft.details.trim(),
        dueType: draft.dueType,
        dueDays: draft.dueType === "before" || draft.dueType === "after" ? Math.round(days) : undefined,
        dueDate: draft.dueType === "date" ? draft.dueDate : undefined,
      }),
      () => setDraft(null)
    );
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...items];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setItems(next);
    run(() => onReorder(next.map((i) => i.id)));
  }

  const inputCls = cn("w-full h-10 px-3 rounded-lg border text-sm focus:outline-none", t.input);

  const form = draft && (
    <div className={cn("rounded-xl border p-4 space-y-3", t.form)}>
      <label className="block">
        <span className={cn("block text-xs font-semibold mb-1", t.muted)}>Task</span>
        <input className={inputCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Submit physician's report" autoFocus maxLength={160} />
      </label>
      <label className="block">
        <span className={cn("block text-xs font-semibold mb-1", t.muted)}>Details <span className="font-normal">(optional)</span></span>
        <textarea className={cn(inputCls, "h-20 py-2 resize-y")} value={draft.details} onChange={(e) => setDraft({ ...draft, details: e.target.value })} placeholder="Where to find the form, who to send it to…" maxLength={2000} />
      </label>
      <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
        <label className="block">
          <span className={cn("block text-xs font-semibold mb-1", t.muted)}>Due</span>
          <select className={inputCls} value={draft.dueType} onChange={(e) => setDraft({ ...draft, dueType: e.target.value as ChecklistDueType })}>
            {RULES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        {(draft.dueType === "before" || draft.dueType === "after") && (
          <label className="block sm:w-36">
            <span className={cn("block text-xs font-semibold mb-1", t.muted)}>Days</span>
            <input
              className={inputCls}
              inputMode="numeric"
              placeholder="0 = move day"
              value={draft.dueDays}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setDraft({ ...draft, dueDays: e.target.value.replace(/[^\d]/g, "").slice(0, 3) })}
            />
          </label>
        )}
        {draft.dueType === "date" && (
          <label className="block sm:w-44">
            <span className={cn("block text-xs font-semibold mb-1", t.muted)}>Date</span>
            <input type="date" className={inputCls} value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
          </label>
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={saveDraft} disabled={pending} className={cn("h-10 px-4 rounded-lg text-white text-sm font-semibold disabled:opacity-60", t.primary)}>
          {pending ? "Saving…" : draft.id ? "Save task" : "Add task"}
        </button>
        <button type="button" onClick={() => { setDraft(null); setError(""); }} className={cn("h-10 px-4 rounded-lg border text-sm font-semibold", t.secondary)}>Cancel</button>
      </div>
    </div>
  );

  return (
    <section className={cn("rounded-2xl border p-5", t.card)}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <ClipboardList className={cn("w-4 h-4", t.muted)} />
          <h2 className={cn("text-base font-bold", t.title)}>Resident checklist</h2>
        </div>
        {!draft && (
          <button type="button" onClick={() => { setDraft({ ...EMPTY }); setError(""); }} className={cn("inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-white text-sm font-semibold", t.primary)}>
            <Plus className="w-4 h-4" /> Add task
          </button>
        )}
      </div>
      <p className={cn("text-sm mb-4", t.muted)}>
        Every resident moving into {communityName} sees these tasks at the bottom of their Plan page. Due dates count from each resident&rsquo;s move date.
      </p>

      {draft && !draft.id && <div className="mb-4">{form}</div>}

      {items.length === 0 && !draft ? (
        <div className={cn("rounded-xl border border-dashed px-4 py-8 text-center text-sm", t.row, t.muted)}>
          No tasks yet. Add the first one, like &ldquo;Sign residency agreement&rdquo; or &ldquo;Schedule move-in walkthrough&rdquo;.
        </div>
      ) : (
        <ol className="space-y-2">
          {items.map((item, i) => (
            <li key={item.id}>
              {draft?.id === item.id ? form : (
                <div className={cn("flex items-start gap-3 rounded-xl border px-3.5 py-3", t.row)}>
                  <span className={cn("text-xs font-semibold w-5 text-right mt-0.5 tabular-nums", t.muted)}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium", t.title)}>{item.title}</p>
                    <p className={cn("text-xs mt-0.5", t.muted)}>{dueRuleLabel(item)}{item.details ? " · has details" : ""}</p>
                  </div>
                  {confirmRemove === item.id ? (
                    <div className="flex items-center gap-1.5">
                      <span className={cn("text-xs", t.muted)}>Remove?</span>
                      <button type="button" disabled={pending} onClick={() => run(() => onRemove(item.id), () => setConfirmRemove(null))} className="h-8 px-2.5 rounded-lg bg-red-600 text-white text-xs font-semibold disabled:opacity-60">Remove</button>
                      <button type="button" onClick={() => setConfirmRemove(null)} className={cn("h-8 px-2.5 rounded-lg border text-xs font-semibold", t.secondary)}>Keep</button>
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <button type="button" aria-label="Move up" disabled={i === 0 || pending} onClick={() => move(i, -1)} className={cn("w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-25", t.icon)}><ArrowUp className="w-4 h-4" /></button>
                      <button type="button" aria-label="Move down" disabled={i === items.length - 1 || pending} onClick={() => move(i, 1)} className={cn("w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-25", t.icon)}><ArrowDown className="w-4 h-4" /></button>
                      <button
                        type="button"
                        aria-label="Edit"
                        onClick={() => { setError(""); setDraft({ id: item.id, title: item.title, details: item.details, dueType: item.dueType, dueDays: item.dueDays ? String(item.dueDays) : "", dueDate: item.dueDate ?? "" }); }}
                        className={cn("w-8 h-8 rounded-lg flex items-center justify-center", t.icon)}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button type="button" aria-label="Remove" onClick={() => setConfirmRemove(item.id)} className={cn("w-8 h-8 rounded-lg flex items-center justify-center hover:text-red-500", t.icon)}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {error && <p className="text-sm text-red-500 mt-3" role="alert">{error}</p>}
      {items.length > 0 && (
        <p className={cn("text-xs mt-4", t.muted)}>Removing a task hides it for everyone; what residents already finished is kept.</p>
      )}
      {onDone && items.length > 0 && !draft && (
        <button type="button" onClick={onDone} className={cn("mt-4 h-10 px-5 rounded-lg text-white text-sm font-semibold", t.primary)}>
          Done, show my residents
        </button>
      )}
    </section>
  );
}
