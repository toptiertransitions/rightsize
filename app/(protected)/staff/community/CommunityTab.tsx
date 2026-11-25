"use client";

// Ops > Community: senior living communities and condo buildings, with
// their Move-Day Rules and Contacts. One fetch, then search, filters and
// sorting run in the browser. Search, filters, sort and the open community
// live in the URL (?tab=community&q=&type=&sort=&community=rec...).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { completeness } from "@/lib/communities/completeness";
import { telHref, bestPhone } from "@/lib/communities/phones";
import {
  DEFAULT_SORT, EMPTY_FILTERS, STALE_DAYS, daysSince, filterCommunities, searchHaystack, sortCommunities,
  type CommunityFilters, type SortKey, type SortState,
} from "@/lib/communities/search";
import { COI_OPTIONS, COMMUNITY_STATUSES, COMMUNITY_TYPES, primaryMoveInContact, type Community, type CommunityWithContacts } from "@/lib/communities/types";
import { CommunityDrawer } from "./CommunityDrawer";
import { CoiBadge, CompletenessBar, ConfirmDialog, Highlight, Icon, Toasts, useFocusTrap, useToasts } from "./ui";

type ColumnKey = "type" | "city" | "contact" | "coi" | "completeness" | "verified";
const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "type", label: "Type" },
  { key: "city", label: "City" },
  { key: "contact", label: "Primary Move-In Contact" },
  { key: "coi", label: "COI" },
  { key: "completeness", label: "Completeness" },
  { key: "verified", label: "Last Verified" },
];
const SORT_LABELS: Record<SortKey, string> = { name: "Name", type: "Type", city: "City", contact: "Move-In Contact", coi: "COI", completeness: "Completeness", verified: "Last Verified" };
const COLUMNS_KEY = "rightsize.communities.columns";

// ─── URL state ────────────────────────────────────────────────────────────────

const LIST_KEYS = ["type", "city", "status", "coi"] as const;

function readUrl(): { filters: CommunityFilters; sort: SortState; open: string | null } {
  if (typeof window === "undefined") return { filters: EMPTY_FILTERS, sort: DEFAULT_SORT, open: null };
  const p = new URLSearchParams(window.location.search);
  const list = (k: string) => (p.get(k) ?? "").split(",").filter(Boolean);
  const [key, dir] = (p.get("sort") ?? "").split(":");
  return {
    filters: {
      q: p.get("q") ?? "",
      type: list("type"), city: list("city"), status: list("status"), coi: list("coi"),
      completeness: p.get("complete") === "complete" || p.get("complete") === "needs" ? (p.get("complete") as "complete" | "needs") : "",
      archived: p.get("archived") === "1",
    },
    sort: key && key in SORT_LABELS ? { key: key as SortKey, dir: dir === "desc" ? "desc" : "asc" } : DEFAULT_SORT,
    open: p.get("community"),
  };
}

function writeUrl(filters: CommunityFilters, sort: SortState, open: string | null, push: boolean) {
  const p = new URLSearchParams(window.location.search);
  p.set("tab", "community");
  const set = (k: string, v: string) => (v ? p.set(k, v) : p.delete(k));
  set("q", filters.q.trim());
  for (const k of LIST_KEYS) set(k, filters[k].join(","));
  set("complete", filters.completeness);
  set("archived", filters.archived ? "1" : "");
  set("sort", sort.key === DEFAULT_SORT.key && sort.dir === DEFAULT_SORT.dir ? "" : `${sort.key}:${sort.dir}`);
  set("community", open ?? "");
  const url = `${window.location.pathname}?${p.toString()}`;
  if (url === `${window.location.pathname}${window.location.search}`) return;
  if (push) window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

// ─── Filter controls ─────────────────────────────────────────────────────────

function CheckList({ options, selected, onChange, label }: { options: readonly string[]; selected: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      {options.map((o) => (
        <label key={o} className="flex items-center gap-3 px-3 min-h-[44px] rounded-lg hover:bg-gray-50 cursor-pointer text-sm text-gray-800">
          <input
            type="checkbox"
            checked={selected.includes(o)}
            onChange={(e) => onChange(e.target.checked ? [...selected, o] : selected.filter((x) => x !== o))}
            className="w-4 h-4 accent-forest-600"
          />
          {o}
        </label>
      ))}
    </fieldset>
  );
}

function Dropdown({ label, active, children, align = "left", icon }: { label: string; active?: boolean; children: React.ReactNode; align?: "left" | "right"; icon?: "columns" | "sort" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(
          "inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl border text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-500",
          active ? "border-forest-300 bg-forest-50 text-forest-800" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
        )}
      >
        {icon && <Icon name={icon} className="w-4 h-4" />}
        {label}
        <Icon name="chevronDown" className="w-3.5 h-3.5 opacity-60" />
      </button>
      {open && (
        <div className={cn("absolute z-30 mt-1.5 w-60 max-h-80 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg", align === "right" ? "right-0" : "left-0")}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Row menu ─────────────────────────────────────────────────────────────────

function RowMenu({ c, canEdit, canArchive, onOpen, onEdit, onPdf, onArchive }: {
  c: Community; canEdit: boolean; canArchive: boolean; onOpen: () => void; onEdit: () => void; onPdf: () => void; onArchive: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [open]);
  const item = (label: string, icon: Parameters<typeof Icon>[0]["name"], run: () => void, danger?: boolean) => (
    <button
      role="menuitem"
      onClick={(e) => { e.stopPropagation(); setOpen(false); run(); }}
      className={cn("w-full flex items-center gap-2.5 px-3 min-h-[40px] rounded-lg text-sm text-left hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-100", danger ? "text-red-700" : "text-gray-800")}
    >
      <Icon name={icon} className="w-4 h-4" />{label}
    </button>
  );
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Actions for ${c.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-500"
      >
        <Icon name="more" className="w-4 h-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-48 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
          {item("Open", "info", onOpen)}
          {canEdit && !c.archived && item("Edit", "edit", onEdit)}
          {item("Download PDF", "download", onPdf)}
          {canArchive && item(c.archived ? "Restore" : "Archive", c.archived ? "restore" : "archive", onArchive, !c.archived)}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function CommunityTab() {
  const initial = useMemo(readUrl, []);
  const [communities, setCommunities] = useState<CommunityWithContacts[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [canArchive, setCanArchive] = useState(false);
  const [filters, setFilters] = useState<CommunityFilters>(initial.filters);
  const [query, setQuery] = useState(initial.filters.q); // input value; filters.q is debounced
  const [sort, setSort] = useState<SortState>(initial.sort);
  const [openId, setOpenId] = useState<string | null>(initial.open);
  const [startEditing, setStartEditing] = useState(false);
  const [hidden, setHidden] = useState<ColumnKey[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Community | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { toasts, show, dismiss } = useToasts();
  const sheetRef = useFocusTrap(sheetOpen);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/staff/communities", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't load communities.");
      setCommunities(data.communities);
      setCanEdit(!!data.canEdit);
      setCanArchive(!!data.canArchive);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load communities.");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Column choice is a per-browser convenience
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? "[]"); if (Array.isArray(v)) setHidden(v); } catch { /* ignore */ }
  }, []);
  const toggleColumn = (k: ColumnKey) => setHidden((h) => {
    const next = h.includes(k) ? h.filter((x) => x !== k) : [...h, k];
    try { localStorage.setItem(COLUMNS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === query ? f : { ...f, q: query })), 150);
    return () => clearTimeout(t);
  }, [query]);

  // Filters and sort → URL (replace); opening a community → URL (push, so Back closes it)
  useEffect(() => { writeUrl(filters, sort, openId, false); }, [filters, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const openCommunity = useCallback((id: string | null, edit = false) => {
    setStartEditing(edit);
    setOpenId(id);
    writeUrl(filters, sort, id, true);
  }, [filters, sort]);
  useEffect(() => {
    const onPop = () => {
      const u = readUrl();
      setOpenId(u.open);
      setFilters(u.filters);
      setQuery(u.filters.q);
      setSort(u.sort);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // Leaving the tab drops its URL params
  useEffect(() => () => {
    const p = new URLSearchParams(window.location.search);
    for (const k of ["tab", "q", ...LIST_KEYS, "complete", "archived", "sort", "community"]) p.delete(k);
    const qs = p.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, []);

  // "/" focuses search; Esc clears it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.closest("input, textarea, select, [contenteditable=true]");
      if (e.key === "/" && !typing && !openId) { e.preventDefault(); searchRef.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openId]);

  const haystacks = useMemo(() => new Map((communities ?? []).map((c) => [c.id, searchHaystack(c)])), [communities]);
  const visible = useMemo(
    () => (communities ? sortCommunities(filterCommunities(communities, filters, haystacks), sort) : []),
    [communities, filters, haystacks, sort]
  );
  const activeCount = communities?.filter((c) => !c.archived).length ?? 0;
  const cities = useMemo(() => [...new Set((communities ?? []).map((c) => c.city).filter(Boolean))].sort(), [communities]);

  const chips: { label: string; clear: () => void }[] = [
    ...LIST_KEYS.flatMap((k) => filters[k].map((v) => ({ label: `${k === "coi" ? "COI" : k[0].toUpperCase() + k.slice(1)}: ${v}`, clear: () => setFilters((f) => ({ ...f, [k]: f[k].filter((x) => x !== v) })) }))),
    ...(filters.completeness ? [{ label: filters.completeness === "complete" ? "Complete" : "Needs info", clear: () => setFilters((f) => ({ ...f, completeness: "" })) }] : []),
    ...(filters.archived ? [{ label: "Showing archived", clear: () => setFilters((f) => ({ ...f, archived: false })) }] : []),
  ];
  const clearAll = () => { setFilters({ ...EMPTY_FILTERS }); setQuery(""); };

  const sortBy = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "completeness" || key === "verified" ? "desc" : "asc" }));
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none");

  // Merge a saved community back into the list
  const upsert = useCallback((c: Partial<CommunityWithContacts> & { id: string }) => {
    setCommunities((list) => {
      if (!list) return list;
      const i = list.findIndex((x) => x.id === c.id);
      if (i < 0) return [...list, { ...(c as CommunityWithContacts), contacts: c.contacts ?? [] }];
      const next = [...list];
      next[i] = { ...next[i], ...c };
      return next;
    });
  }, []);

  async function setArchived(c: Community, archived: boolean, withUndo = true) {
    upsert({ id: c.id, archived });
    try {
      const res = await fetch(`/api/staff/communities/${c.id}/archive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't update.");
      upsert(data.community);
      if (archived && openId === c.id) openCommunity(null);
      show(archived ? `${c.name} archived.` : `${c.name} restored.`, "ok", withUndo ? { label: "Undo", run: () => setArchived(c, !archived, false) } : undefined);
    } catch (e) {
      upsert({ id: c.id, archived: !archived });
      show(e instanceof Error ? e.message : "Couldn't update.", "error");
    }
  }

  async function downloadPdf(c: Community, opts = { internal: false, hideUnknown: false }) {
    try {
      const qs = new URLSearchParams({ ...(opts.internal ? { internal: "1" } : {}), ...(opts.hideUnknown ? { hideUnknown: "1" } : {}) });
      const res = await fetch(`/api/staff/communities/${c.id}/pdf?${qs}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't make the PDF.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `TTT Community Guide - ${c.name.replace(/[\\/:*?"<>|]+/g, " ")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      show("Community Guide downloaded.");
      return true;
    } catch (e) {
      show(e instanceof Error ? e.message : "Couldn't make the PDF.", "error");
      return false;
    }
  }

  const isShown = (k: ColumnKey) => !hidden.includes(k);
  const filterGroups: { key: keyof CommunityFilters; label: string; node: React.ReactNode; active: boolean }[] = [
    { key: "type", label: "Type", active: filters.type.length > 0, node: <CheckList label="Type" options={COMMUNITY_TYPES} selected={filters.type} onChange={(v) => setFilters((f) => ({ ...f, type: v }))} /> },
    { key: "city", label: "City", active: filters.city.length > 0, node: cities.length ? <CheckList label="City" options={cities} selected={filters.city} onChange={(v) => setFilters((f) => ({ ...f, city: v }))} /> : <p className="px-3 py-2 text-sm text-gray-500">No cities yet</p> },
    { key: "status", label: "Status", active: filters.status.length > 0, node: <CheckList label="Status" options={COMMUNITY_STATUSES} selected={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} /> },
    { key: "coi", label: "COI Required", active: filters.coi.length > 0, node: <CheckList label="COI Required" options={COI_OPTIONS} selected={filters.coi} onChange={(v) => setFilters((f) => ({ ...f, coi: v }))} /> },
    {
      key: "completeness", label: "Completeness", active: !!filters.completeness, node: (
        <fieldset>
          <legend className="sr-only">Completeness</legend>
          {([["", "Any"], ["complete", "Complete"], ["needs", "Needs info"]] as const).map(([v, l]) => (
            <label key={v} className="flex items-center gap-3 px-3 min-h-[44px] rounded-lg hover:bg-gray-50 cursor-pointer text-sm text-gray-800">
              <input type="radio" name="completeness" checked={filters.completeness === v} onChange={() => setFilters((f) => ({ ...f, completeness: v }))} className="w-4 h-4 accent-forest-600" />
              {l}
            </label>
          ))}
        </fieldset>
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="mr-auto">
          <h2 className="text-xl font-semibold text-gray-900">Communities</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {communities ? `${activeCount} ${activeCount === 1 ? "community" : "communities"}` : "Loading"}. Move-day rules and contacts for every building we work in.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => openCommunity("new")}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-forest-600 text-white text-sm font-semibold shadow-sm hover:bg-forest-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-forest-500"
          >
            <Icon name="plus" className="w-4 h-4" /> Add community
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[220px]">
          <Icon name="search" className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <label htmlFor="community-search" className="sr-only">Search communities</label>
          <input
            id="community-search"
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setQuery(""); } }}
            placeholder="Search names, contacts, addresses, rules"
            className="w-full min-h-[44px] pl-9 pr-12 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
          />
          <kbd className="hidden md:block absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 border border-gray-200 rounded px-1.5">/</kbd>
        </div>
        <div className="hidden md:flex items-center gap-2 flex-wrap">
          {filterGroups.map((g) => <Dropdown key={g.key} label={g.label} active={g.active}>{g.node}</Dropdown>)}
          <Dropdown label={`Sort: ${SORT_LABELS[sort.key]}`} icon="sort" align="right">
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <button key={k} onClick={() => sortBy(k)} className="w-full flex items-center justify-between px-3 min-h-[40px] rounded-lg text-sm hover:bg-gray-50 text-gray-800">
                {SORT_LABELS[k]}
                {sort.key === k && <Icon name={sort.dir === "asc" ? "arrowUp" : "arrowDown"} className="w-3.5 h-3.5 text-forest-600" />}
              </button>
            ))}
          </Dropdown>
          <Dropdown label="Columns" icon="columns" align="right">
            {COLUMNS.map((col) => (
              <label key={col.key} className="flex items-center gap-3 px-3 min-h-[40px] rounded-lg hover:bg-gray-50 cursor-pointer text-sm text-gray-800">
                <input type="checkbox" checked={isShown(col.key)} onChange={() => toggleColumn(col.key)} className="w-4 h-4 accent-forest-600" />
                {col.label}
              </label>
            ))}
          </Dropdown>
          <label className="inline-flex items-center gap-2 min-h-[40px] px-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={filters.archived} onChange={(e) => setFilters((f) => ({ ...f, archived: e.target.checked }))} className="w-4 h-4 accent-forest-600" />
            Show archived
          </label>
        </div>
        <button
          onClick={() => setSheetOpen(true)}
          className="md:hidden inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700"
        >
          <Icon name="filter" className="w-4 h-4" /> Filters{chips.length ? ` (${chips.length})` : ""}
        </button>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {chips.map((c) => (
            <button key={c.label} onClick={c.clear} className="inline-flex items-center gap-1.5 min-h-[32px] rounded-full bg-forest-50 text-forest-800 px-3 text-xs font-medium ring-1 ring-inset ring-forest-200 hover:bg-forest-100" aria-label={`Remove filter ${c.label}`}>
              {c.label}<Icon name="x" className="w-3 h-3" />
            </button>
          ))}
          <button onClick={clearAll} className="text-xs font-medium text-gray-600 underline underline-offset-2 min-h-[32px] px-1">Clear all</button>
        </div>
      )}

      {/* Body */}
      {loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 flex items-center gap-3">
          <Icon name="alert" className="w-5 h-5" />
          <span className="flex-1">{loadError}</span>
          <button onClick={() => { setCommunities(null); load(); }} className="min-h-[40px] px-4 rounded-xl bg-white border border-red-200 font-medium hover:bg-red-100">Try again</button>
        </div>
      ) : communities === null ? (
        <div className="rounded-2xl border border-gray-200 overflow-hidden" aria-busy="true" aria-label="Loading communities">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4 border-b border-gray-100 last:border-0 motion-safe:animate-pulse">
              <div className="h-4 w-48 bg-gray-200 rounded" /><div className="h-4 w-20 bg-gray-100 rounded hidden md:block" />
              <div className="h-4 w-24 bg-gray-100 rounded hidden md:block" /><div className="h-4 w-36 bg-gray-100 rounded hidden md:block" />
              <div className="h-2 w-28 bg-gray-100 rounded-full ml-auto" />
            </div>
          ))}
        </div>
      ) : communities.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-cream-50 p-10 text-center">
          <p className="text-lg font-semibold text-gray-900">No communities yet</p>
          <p className="text-sm text-gray-600 mt-1 max-w-md mx-auto">Add the first building you work in. Only the name and type are needed to start; fill in rules and contacts as you learn them.</p>
          {canEdit && <button onClick={() => openCommunity("new")} className="mt-5 inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700"><Icon name="plus" className="w-4 h-4" />Add community</button>}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 p-10 text-center">
          <p className="text-base font-semibold text-gray-900">{filters.q ? <>Nothing matches &ldquo;{filters.q}&rdquo;</> : "Nothing matches these filters"}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button onClick={clearAll} className="min-h-[44px] px-4 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">Clear filters</button>
            {canEdit && filters.q.trim() && (
              <button onClick={() => openCommunity("new")} className="min-h-[44px] px-4 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700">Add &ldquo;{filters.q.trim()}&rdquo; as a new community</button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-2xl border border-gray-200 overflow-auto max-h-[calc(100vh-260px)]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <SortTh label="Community" k="name" sort={sort} onSort={sortBy} ariaSort={ariaSort("name")} />
                  {COLUMNS.filter((c) => isShown(c.key)).map((c) => <SortTh key={c.key} label={c.label} k={c.key} sort={sort} onSort={sortBy} ariaSort={ariaSort(c.key)} />)}
                  <th className="w-12"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const score = completeness(c);
                  const primary = primaryMoveInContact(c.contacts);
                  const phone = primary ? bestPhone(primary.phones) : undefined;
                  const age = daysSince(c.lastVerified);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => openCommunity(c.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) openCommunity(c.id); }}
                      tabIndex={0}
                      className={cn("border-t border-gray-100 cursor-pointer hover:bg-forest-50/40 focus:outline-none focus-visible:bg-forest-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-forest-500", openId === c.id && "bg-forest-50/60", c.archived && "opacity-70")}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900"><Highlight text={c.name} query={filters.q} /></div>
                        {c.operator && <div className="text-xs text-gray-500"><Highlight text={c.operator} query={filters.q} /></div>}
                        {c.archived && <span className="text-[11px] text-gray-500">Archived</span>}
                      </td>
                      {isShown("type") && <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{c.type}</td>}
                      {isShown("city") && <td className="px-4 py-3 text-gray-700 whitespace-nowrap"><Highlight text={c.city} query={filters.q} /></td>}
                      {isShown("contact") && (
                        <td className="px-4 py-2">
                          {primary ? (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-800 truncate max-w-[160px]"><Highlight text={primary.name} query={filters.q} /></span>
                              {phone && <a href={telHref(phone.number)} onClick={(e) => e.stopPropagation()} aria-label={`Call ${primary.name}, ${phone.label} ${phone.number}`} title={`${phone.label}: ${phone.number}`} className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-forest-700 hover:bg-forest-50"><Icon name="phone" className="w-4 h-4" /></a>}
                              {primary.email && <a href={`mailto:${primary.email}`} onClick={(e) => e.stopPropagation()} aria-label={`Email ${primary.name}`} title={primary.email} className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-forest-700 hover:bg-forest-50"><Icon name="mail" className="w-4 h-4" /></a>}
                            </div>
                          ) : <span className="text-gray-400">None yet</span>}
                        </td>
                      )}
                      {isShown("coi") && <td className="px-4 py-3"><CoiBadge value={c.rules.coi_required} /></td>}
                      {isShown("completeness") && <td className="px-4 py-3"><CompletenessBar known={score.known} total={score.total} compact /></td>}
                      {isShown("verified") && (
                        <td className="px-4 py-3 whitespace-nowrap">
                          {age === null ? <span className="text-gray-400">Never</span> : (
                            <span className={cn("inline-flex items-center gap-1", age > STALE_DAYS ? "text-amber-700" : "text-gray-700")} title={c.lastVerified}>
                              {age > STALE_DAYS && <Icon name="alert" className="w-3.5 h-3.5" />}
                              {relativeDays(age)}
                            </span>
                          )}
                        </td>
                      )}
                      <td className="pr-2">
                        <RowMenu c={c} canEdit={canEdit} canArchive={canArchive}
                          onOpen={() => openCommunity(c.id)} onEdit={() => openCommunity(c.id, true)}
                          onPdf={() => downloadPdf(c)} onArchive={() => (c.archived ? setArchived(c, false) : setArchiveTarget(c))} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden space-y-3">
            {visible.map((c) => {
              const score = completeness(c);
              const primary = primaryMoveInContact(c.contacts);
              const phone = primary ? bestPhone(primary.phones) : undefined;
              return (
                <li key={c.id}>
                  <div className={cn("rounded-2xl border border-gray-200 bg-white p-4", c.archived && "opacity-70")}>
                    <button onClick={() => openCommunity(c.id)} className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 rounded-lg">
                      <div className="font-semibold text-gray-900"><Highlight text={c.name} query={filters.q} /></div>
                      <div className="text-sm text-gray-500 mt-0.5">{[c.city, c.type].filter(Boolean).join(" | ")}{c.archived ? " | Archived" : ""}</div>
                      <div className="mt-3"><CompletenessBar known={score.known} total={score.total} /></div>
                    </button>
                    {primary && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="text-xs text-gray-500">Move-In Contact</div>
                        <div className="text-sm font-medium text-gray-900">{primary.name}</div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {phone ? <a href={telHref(phone.number)} className="inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-forest-600 text-white text-sm font-semibold"><Icon name="phone" className="w-4 h-4" />Call</a> : <span />}
                          {primary.email ? <a href={`mailto:${primary.email}`} className="inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl border border-forest-200 text-forest-800 text-sm font-semibold"><Icon name="mail" className="w-4 h-4" />Email</a> : <span />}
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Mobile filter sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSheetOpen(false)} />
          <div ref={sheetRef} className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-4 pb-8 shadow-2xl">
            <div className="flex items-center mb-2">
              <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
              <button onClick={() => setSheetOpen(false)} aria-label="Close filters" className="ml-auto w-11 h-11 inline-flex items-center justify-center rounded-xl hover:bg-gray-100"><Icon name="x" className="w-5 h-5" /></button>
            </div>
            {filterGroups.map((g) => (
              <div key={g.key} className="border-t border-gray-100 py-2">
                <div className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{g.label}</div>
                {g.node}
              </div>
            ))}
            <div className="border-t border-gray-100 py-2">
              <div className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Sort</div>
              <div className="flex gap-2 px-3 pt-2">
                <select value={sort.key} onChange={(e) => setSort((s) => ({ ...s, key: e.target.value as SortKey }))} className="flex-1 min-h-[44px] rounded-xl border border-gray-200 px-3 text-sm" aria-label="Sort by">
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
                </select>
                <button onClick={() => setSort((s) => ({ ...s, dir: s.dir === "asc" ? "desc" : "asc" }))} className="min-h-[44px] px-4 rounded-xl border border-gray-200 text-sm" aria-label={`Sort direction: ${sort.dir === "asc" ? "ascending" : "descending"}`}>
                  <Icon name={sort.dir === "asc" ? "arrowUp" : "arrowDown"} className="w-4 h-4" />
                </button>
              </div>
            </div>
            <label className="flex items-center gap-3 px-3 min-h-[48px] border-t border-gray-100 text-sm text-gray-800">
              <input type="checkbox" checked={filters.archived} onChange={(e) => setFilters((f) => ({ ...f, archived: e.target.checked }))} className="w-4 h-4 accent-forest-600" />
              Show archived
            </label>
            <div className="flex gap-2 mt-3">
              <button onClick={clearAll} className="flex-1 min-h-[48px] rounded-xl border border-gray-200 text-sm font-medium">Clear all</button>
              <button onClick={() => setSheetOpen(false)} className="flex-1 min-h-[48px] rounded-xl bg-forest-600 text-white text-sm font-semibold">Show {visible.length}</button>
            </div>
          </div>
        </div>
      )}

      {openId && (
        <CommunityDrawer
          key={openId}
          id={openId}
          startEditing={startEditing}
          allCommunities={communities ?? []}
          canEdit={canEdit}
          canArchive={canArchive}
          initialName={openId === "new" ? filters.q.trim() : ""}
          onClose={() => openCommunity(null)}
          onOpen={(id, edit) => openCommunity(id, edit)}
          onSaved={upsert}
          onArchive={(c) => (c.archived ? setArchived(c, false) : setArchiveTarget(c))}
          onPdf={downloadPdf}
          toast={show}
        />
      )}

      <ConfirmDialog
        open={!!archiveTarget}
        title={`Archive ${archiveTarget?.name ?? ""}?`}
        body={<>It will be hidden from the list, but nothing is deleted. Its rules, contacts and history stay in Rightsize, and a Manager or Admin can restore it anytime from <strong>Show archived</strong>.</>}
        confirmLabel="Archive"
        tone="danger"
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => { const c = archiveTarget!; setArchiveTarget(null); setArchived(c, true); }}
      />
      <Toasts toasts={toasts} dismiss={dismiss} />
    </div>
  );
}

function relativeDays(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) { const m = Math.round(days / 30); return `${m} month${m === 1 ? "" : "s"} ago`; }
  const y = Math.floor(days / 365); return `${y} year${y === 1 ? "" : "s"} ago`;
}

function SortTh({ label, k, sort, onSort, ariaSort }: { label: string; k: SortKey; sort: SortState; onSort: (k: SortKey) => void; ariaSort: "ascending" | "descending" | "none" }) {
  return (
    <th aria-sort={ariaSort} className="px-4 py-2.5 font-semibold whitespace-nowrap">
      <button onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 rounded min-h-[32px] uppercase tracking-wide">
        {label}
        <Icon name={sort.key === k ? (sort.dir === "asc" ? "arrowUp" : "arrowDown") : "sort"} className={cn("w-3.5 h-3.5", sort.key === k ? "text-forest-600" : "text-gray-300")} />
      </button>
    </th>
  );
}
