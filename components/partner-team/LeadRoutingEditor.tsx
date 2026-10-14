"use client";

import { useMemo, useState, useTransition } from "react";
import { Bell, Check, Crown, Users, UserCheck } from "lucide-react";
import type { PartnerUserView } from "@/lib/marketplace/types";
import { leadRecipientIds, type LeadRouting } from "@/lib/marketplace/leadRouting";
import { cn } from "@/lib/utils";
import { avatarColor, initials } from "./teamUi";

export interface LeadRoutingInput {
  routing: LeadRouting;
  userIds: string[];
  includeBusinessEmail: boolean;
}

interface Props {
  theme: "light" | "dark";
  members: PartnerUserView[];
  routing: LeadRouting;
  includeBusinessEmail: boolean;
  businessEmail?: string;
  canEdit: boolean;
  onSave: (input: LeadRoutingInput) => Promise<{ ok: boolean; error?: string }>;
  onSaved?: () => void;
}

// "Who gets new leads" for one partner company: everyone on the team, or
// only the people picked (e.g. the salespeople, not operations), plus
// whether the business email gets a copy.
export function LeadRoutingEditor({ theme, members, routing: initialRouting, includeBusinessEmail: initialBiz, businessEmail, canEdit, onSave, onSaved }: Props) {
  const active = useMemo(() => members.filter((m) => m.status === "Active"), [members]);
  const initialChosen = useMemo(() => {
    // What "selected" would currently send to, so switching modes starts
    // from something sensible rather than an empty list
    const ids = initialRouting === "selected" ? leadRecipientIds("selected", active).ids : active.filter((m) => m.notifyLeads).map((m) => m.id);
    return new Set(ids.length ? ids : active.filter((m) => m.role === "Primary").map((m) => m.id));
  }, [active, initialRouting]);

  const [routing, setRouting] = useState<LeadRouting>(initialRouting);
  const [chosen, setChosen] = useState<Set<string>>(initialChosen);
  const [includeBiz, setIncludeBiz] = useState(initialBiz);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState(0);
  const [pending, start] = useTransition();

  const dirty =
    routing !== initialRouting ||
    includeBiz !== initialBiz ||
    (routing === "selected" && (chosen.size !== initialChosen.size || [...chosen].some((id) => !initialChosen.has(id))));

  const recipients = routing === "all" ? active : active.filter((m) => chosen.has(m.id));
  const names = recipients.map((m) => (m.name || m.email).split(" ")[0]);
  const summary = [
    routing === "all" ? (active.length === 1 ? names[0] ?? "Nobody yet" : `Everyone on the team (${active.length})`) : names.length ? listText(names) : "Nobody",
    includeBiz && businessEmail ? businessEmail : null,
  ].filter(Boolean).join(" + ");

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function save() {
    setError("");
    if (routing === "selected" && chosen.size === 0) return setError("Pick at least one person.");
    start(async () => {
      const r = await onSave({ routing, userIds: [...chosen], includeBusinessEmail: includeBiz });
      if (!r.ok) return setError(r.error ?? "That didn't save.");
      setSavedAt(Date.now());
      onSaved?.();
    });
  }

  const dark = theme === "dark";
  const t = {
    card: dark ? "bg-gray-900 border-gray-800" : "bg-white border-cream-200 shadow-sm",
    title: dark ? "text-white" : "text-gray-900",
    muted: dark ? "text-gray-400" : "text-gray-500",
    option: (on: boolean) => on
      ? dark ? "border-emerald-500 bg-emerald-950/40" : "border-forest-500 bg-forest-50/60 ring-1 ring-forest-500/20"
      : dark ? "border-gray-700 hover:border-gray-600" : "border-gray-200 hover:border-gray-300",
    row: dark ? "hover:bg-gray-800/60" : "hover:bg-cream-50",
    divider: dark ? "divide-gray-800 border-gray-800" : "divide-cream-100 border-cream-200",
    check: (on: boolean) => on ? (dark ? "bg-emerald-500 border-emerald-500" : "bg-forest-600 border-forest-600") : dark ? "border-gray-600" : "border-gray-300",
    button: dark ? "bg-emerald-600 hover:bg-emerald-500" : "bg-forest-600 hover:bg-forest-700",
    summaryBox: dark ? "bg-gray-800/60 text-gray-300" : "bg-cream-100/70 text-gray-700",
  };

  if (!canEdit) {
    return (
      <section className={cn("rounded-2xl border p-5", t.card)}>
        <div className="flex items-center gap-2 mb-1">
          <Bell className={cn("w-4 h-4", t.muted)} />
          <h2 className={cn("text-base font-bold", t.title)}>Who gets new leads</h2>
        </div>
        <p className={cn("text-sm", t.muted)}>{summary}. Your account owner can change this.</p>
      </section>
    );
  }

  return (
    <section className={cn("rounded-2xl border p-5", t.card)}>
      <div className="flex items-center gap-2 mb-1">
        <Bell className={cn("w-4 h-4", t.muted)} />
        <h2 className={cn("text-base font-bold", t.title)}>Who gets new leads</h2>
      </div>
      <p className={cn("text-sm mb-4", t.muted)}>When Top Tier sends a new client lead, these people get an email and a phone notification.</p>

      <div className="grid sm:grid-cols-2 gap-2 mb-4">
        <button type="button" onClick={() => setRouting("all")} className={cn("rounded-xl border px-4 py-3 text-left transition-colors", t.option(routing === "all"))}>
          <p className={cn("text-sm font-semibold flex items-center gap-2", t.title)}><Users className="w-4 h-4" /> Everyone on the team</p>
          <p className={cn("text-xs mt-1", t.muted)}>{active.length} {active.length === 1 ? "person" : "people"} now, plus anyone who joins later.</p>
        </button>
        <button type="button" onClick={() => setRouting("selected")} className={cn("rounded-xl border px-4 py-3 text-left transition-colors", t.option(routing === "selected"))}>
          <p className={cn("text-sm font-semibold flex items-center gap-2", t.title)}><UserCheck className="w-4 h-4" /> Only people you choose</p>
          <p className={cn("text-xs mt-1", t.muted)}>For example, just your salespeople. New teammates start without leads.</p>
        </button>
      </div>

      {routing === "selected" && (
        <ul className={cn("rounded-xl border divide-y mb-4 overflow-hidden", t.divider)}>
          {active.map((m) => {
            const on = chosen.has(m.id);
            return (
              <li key={m.id}>
                <button type="button" onClick={() => toggle(m.id)} aria-pressed={on} className={cn("w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors", t.row)}>
                  <span className={cn("w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0", t.check(on))}>
                    {on && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                  </span>
                  <span className={cn("w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0", dark ? "bg-gray-800 text-gray-300" : avatarColor(m.email))}>
                    {initials(m.name, m.email)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("text-sm font-medium flex items-center gap-1.5", t.title)}>
                      <span className="truncate">{m.name || m.email}</span>
                      {m.role === "Primary" && <Crown className={cn("w-3.5 h-3.5 flex-shrink-0", dark ? "text-amber-300" : "text-amber-600")} aria-label="Owner" />}
                    </span>
                    <span className={cn("block text-xs truncate", t.muted)}>{m.title || m.email}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {active.length === 0 && <li className={cn("px-3.5 py-3 text-sm", t.muted)}>No one has joined yet.</li>}
        </ul>
      )}

      {businessEmail && (
        <label className="flex items-start gap-3 mb-4 cursor-pointer select-none">
          <button
            type="button"
            role="checkbox"
            aria-checked={includeBiz}
            onClick={() => setIncludeBiz((v) => !v)}
            className={cn("mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0", t.check(includeBiz))}
          >
            {includeBiz && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
          </button>
          <span onClick={() => setIncludeBiz((v) => !v)}>
            <span className={cn("block text-sm font-medium", t.title)}>Also email the business address</span>
            <span className={cn("block text-xs", t.muted)}>{businessEmail}</span>
          </span>
        </label>
      )}

      <div className={cn("rounded-lg px-3.5 py-2.5 text-xs mb-4", t.summaryBox)}>
        <span className="font-semibold">Leads go to:</span> {summary}
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={!dirty || pending} className={cn("h-10 px-5 rounded-xl text-white text-sm font-semibold disabled:opacity-40 transition-colors", t.button)}>
          {pending ? "Saving…" : "Save"}
        </button>
        {error ? <p className="text-sm text-red-500" role="alert">{error}</p> : savedAt > 0 && !dirty ? <p className={cn("text-sm", t.muted)}>Saved</p> : null}
      </div>
    </section>
  );
}

function listText(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
