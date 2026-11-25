"use client";

// Community detail drawer: right panel on desktop, full screen on phones.
// View mode by default; Edit makes everything editable in place with a
// sticky Save / Cancel footer. "new" opens it as a create form.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { completeness } from "@/lib/communities/completeness";
import { bestPhone, telHref } from "@/lib/communities/phones";
import { STALE_DAYS, daysSince, findLikelyDuplicates } from "@/lib/communities/search";
import { communityFieldsSchema, fieldErrors } from "@/lib/communities/schema";
import {
  COI_OPTIONS, COMMUNITY_STATUSES, COMMUNITY_TYPES, RULE_DEFINITIONS, emptyRules, formatAddress, primaryMoveInContact, ruleStatus,
  type Community, type CommunityActivity, type CommunityContact, type CommunityWithContacts, type RuleKey, type RuleStatus,
} from "@/lib/communities/types";
import { ContactsSection } from "./ContactsSection";
import { CompletenessBar, ConfirmDialog, CopyButton, Icon, Section, useFocusTrap } from "./ui";

type Draft = Pick<Community,
  "name" | "type" | "operator" | "street" | "city" | "state" | "zip" | "website" | "linkedCompanyId" | "status" | "rules" | "ruleStatus" |
  "floorPlansOnFile" | "floorPlansNotes" | "openItems" | "sourceNotes" | "internalNotes">;
const DRAFT_KEYS: (keyof Draft)[] = ["name", "type", "operator", "street", "city", "state", "zip", "website", "linkedCompanyId", "status", "rules", "ruleStatus", "floorPlansOnFile", "floorPlansNotes", "openItems", "sourceNotes", "internalNotes"];

const toDraft = (c: Community): Draft => Object.fromEntries(DRAFT_KEYS.map((k) => [k, k === "rules" ? { ...c.rules } : k === "ruleStatus" ? { ...c.ruleStatus } : c[k]])) as Draft;
const blankDraft = (name: string): Draft => ({
  name, type: "Senior Living", operator: "", street: "", city: "", state: "IL", zip: "", website: "", linkedCompanyId: "", status: "Active",
  rules: emptyRules(), ruleStatus: {}, floorPlansOnFile: false, floorPlansNotes: "", openItems: "", sourceNotes: "", internalNotes: "",
});
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());

/** Only the fields that changed, ruleStatus without "known" (it's derived). */
function diff(base: Draft, draft: Draft): Partial<Draft> {
  const out: Partial<Draft> = {};
  for (const k of DRAFT_KEYS) if (!same(base[k], draft[k])) (out as Record<string, unknown>)[k] = draft[k];
  return out;
}

function AutoTextarea({ value, onChange, id, placeholder, invalid, rows = 2, autoFocus }: {
  value: string; onChange: (v: string) => void; id: string; placeholder?: string; invalid?: boolean; rows?: number; autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  return (
    <textarea
      ref={ref}
      id={id}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      className={cn("w-full resize-none rounded-xl border px-3 py-2.5 text-sm text-gray-900 leading-relaxed placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent", invalid ? "border-red-400" : "border-gray-200")}
    />
  );
}

function Field({ label, htmlFor, error, children, hint }: { label: string; htmlFor: string; error?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-600 mt-1" role="alert">{error}</p>}
    </div>
  );
}

const inputCls = (invalid?: boolean) => cn("w-full min-h-[44px] rounded-xl border px-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent bg-white", invalid ? "border-red-400" : "border-gray-200");

function AskChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 px-2 py-0.5 text-xs font-medium whitespace-nowrap">
      <Icon name="alert" className="w-3 h-3" />Ask community
    </span>
  );
}

export function CommunityDrawer({
  id, startEditing, allCommunities, canEdit, canArchive, initialName, onClose, onOpen, onSaved, onArchive, onPdf, toast,
}: {
  id: string;
  startEditing: boolean;
  allCommunities: CommunityWithContacts[];
  canEdit: boolean;
  canArchive: boolean;
  initialName: string;
  onClose: () => void;
  onOpen: (id: string, edit?: boolean) => void;
  onSaved: (c: Partial<CommunityWithContacts> & { id: string }) => void;
  onArchive: (c: Community) => void;
  onPdf: (c: Community, opts: { internal: boolean; hideUnknown: boolean }) => Promise<boolean>;
  toast: (text: string, tone?: "ok" | "error", action?: { label: string; run: () => void }) => void;
}) {
  const isNew = id === "new";
  const [community, setCommunity] = useState<Community | null>(null);
  const [contacts, setContacts] = useState<CommunityContact[]>([]);
  const [activity, setActivity] = useState<CommunityActivity[]>([]);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(isNew || (startEditing && canEdit));
  const [draft, setDraft] = useState<Draft>(() => blankDraft(initialName));
  const [base, setBase] = useState<Draft>(() => blankDraft(initialName));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [focusRule, setFocusRule] = useState<RuleKey | null>(null);
  const [confirmClose, setConfirmClose] = useState<null | (() => void)>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfOpts, setPdfOpts] = useState({ internal: false, hideUnknown: false });
  const [pdfBusy, setPdfBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ rules: true, contacts: true, reference: true, notes: true, history: false });
  const trapRef = useFocusTrap(true);
  const dirty = editing && !same(base, draft);

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setOpenSections({ rules: true, contacts: true, reference: false, notes: false, history: false });
  }, []);

  const load = useCallback(async () => {
    if (isNew) return;
    setLoadError("");
    try {
      const res = await fetch(`/api/staff/communities/${id}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't load this community.");
      setCommunity(data.community);
      setContacts(data.contacts);
      setActivity(data.activity);
      const d = toDraft(data.community);
      setDraft(d);
      setBase(d);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load this community.");
    }
  }, [id, isNew]);
  useEffect(() => { load(); }, [load]);

  const refreshActivity = useCallback(async () => {
    if (isNew) return;
    const res = await fetch(`/api/staff/communities/${id}`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setActivity((await res.json()).activity);
  }, [id, isNew]);

  // Keep the list (contacts, rules, verified date) in step with the drawer
  useEffect(() => { if (community) onSaved({ ...community, contacts }); }, [community, contacts]); // eslint-disable-line react-hooks/exhaustive-deps

  const requestClose = useCallback((then?: () => void) => {
    const go = then ?? onClose;
    if (dirty) setConfirmClose(() => go);
    else go();
  }, [dirty, onClose]);

  // Warn before leaving the page with unsaved edits
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = useCallback(async () => {
    if (saving) return;
    const parsed = communityFieldsSchema.partial().safeParse(draft);
    const nameMissing = !draft.name.trim();
    if (!parsed.success || nameMissing) {
      const errs = parsed.success ? {} : fieldErrors(parsed.error);
      if (nameMissing) errs.name = "Name is required";
      setErrors(errs);
      toast("Check the highlighted fields.", "error");
      return;
    }
    setErrors({});
    if (isNew) {
      setSaving(true);
      try {
        const body = Object.fromEntries(Object.entries(diff(blankDraft(""), draft)).concat([["name", draft.name], ["type", draft.type]]));
        const res = await fetch("/api/staff/communities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { if (data.fields) setErrors(data.fields); throw new Error(data.error ?? "Couldn't add the community."); }
        onSaved({ ...data.community, contacts: [] });
        toast(`${data.community.name} added. Fill in what you know.`);
        onOpen(data.community.id, true);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Couldn't add the community.", "error");
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!community) return;
    const changes = diff(base, draft);
    if (!Object.keys(changes).length) { setEditing(false); return; }
    // Optimistic: show the saved version now, roll back if Airtable says no
    const before = community;
    const optimistic: Community = { ...community, ...changes, rules: { ...community.rules, ...(changes.rules ?? {}) } };
    setCommunity(optimistic);
    onSaved(optimistic);
    setEditing(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/staff/communities/${community.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { if (data.fields) setErrors(data.fields); throw new Error(data.error ?? "Couldn't save."); }
      setCommunity(data.community);
      onSaved(data.community);
      const d = toDraft(data.community);
      setBase(d);
      setDraft(d);
      toast("Saved.");
      refreshActivity();
    } catch (e) {
      setCommunity(before);
      onSaved(before);
      setEditing(true); // keep their edits on screen
      toast(e instanceof Error ? e.message : "Couldn't save. Your changes are still here.", "error");
    } finally {
      setSaving(false);
    }
  }, [saving, draft, isNew, community, base, onSaved, onOpen, toast, refreshActivity]);

  /** Small one-off changes from view mode (Mark N/A, Mark verified). */
  async function quickPatch(changes: Partial<Community>, message: string) {
    if (!community) return;
    setCommunity((c) => (c ? { ...c, ...changes } : c));
    try {
      const res = await fetch(`/api/staff/communities/${community.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't save.");
      toast(message);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save.", "error");
    }
    // Reload either way: confirms the save, or rolls the screen back
    await load();
  }

  // Keyboard: Esc closes (or cancels), Cmd/Ctrl+S saves
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmClose) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && editing) { e.preventDefault(); if (dirty || isNew) save(); }
      else if (e.key === "Escape" && !e.defaultPrevented) {
        if (pdfOpen) { setPdfOpen(false); return; }
        if (menuOpen) { setMenuOpen(false); return; }
        requestClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmClose, editing, dirty, isNew, save, requestClose, pdfOpen, menuOpen]);

  const duplicates = useMemo(() => {
    if (!editing) return [];
    return findLikelyDuplicates({ name: draft.name, street: draft.street }, allCommunities, isNew ? undefined : id).slice(0, 2);
  }, [editing, draft.name, draft.street, allCommunities, id, isNew]);

  const setRule = (key: RuleKey, text: string) => setDraft((d) => {
    const status = { ...d.ruleStatus };
    if (text.trim() && status[key] === "unknown") delete status[key];
    if (text.trim() && status[key] === "not_applicable") delete status[key];
    return { ...d, rules: { ...d.rules, [key]: text }, ruleStatus: status };
  });
  const setRuleMode = (key: RuleKey, mode: RuleStatus) => setDraft((d) => {
    const status = { ...d.ruleStatus };
    if (mode === "known") delete status[key]; else status[key] = mode;
    return { ...d, ruleStatus: status };
  });

  const view = community;
  const score = completeness(editing ? draft : view ?? draft);
  const primary = primaryMoveInContact(contacts);
  const primaryPhone = primary ? bestPhone(primary.phones) : undefined;
  const address = view ? formatAddress(view) : "";
  const verifiedAge = view ? daysSince(view.lastVerified) : null;
  const title = isNew ? (draft.name.trim() || "New community") : view?.name ?? "Loading";
  const toggle = (k: string) => setOpenSections((s) => ({ ...s, [k]: !s[k] }));

  async function runPdf() {
    if (!view) return;
    setPdfBusy(true);
    const ok = await onPdf(view, pdfOpts);
    setPdfBusy(false);
    if (ok) { setPdfOpen(false); refreshActivity(); }
  }

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <div className="absolute inset-0 bg-black/30 motion-safe:transition-opacity hidden md:block" onClick={() => requestClose()} />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-drawer-title"
        className="absolute inset-y-0 right-0 w-full md:w-[min(760px,92vw)] bg-white shadow-2xl flex flex-col"
      >
        {/* Sticky header */}
        <div className="border-b border-gray-100 px-4 md:px-6 pt-4 pb-3 bg-white">
          <div className="flex flex-wrap md:flex-nowrap items-start gap-2">
            <button onClick={() => requestClose()} aria-label="Close" className="md:hidden -ml-2 w-11 h-11 inline-flex items-center justify-center rounded-xl hover:bg-gray-100"><Icon name="chevronDown" className="w-5 h-5 rotate-90" /></button>
            <div className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] md:basis-0">
              <h2 id="community-drawer-title" className="text-xl font-semibold text-gray-900 leading-tight break-words">{title}</h2>
              {view && !editing && (
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="rounded-full bg-[#F6F2E9] text-[#4E5A40] px-2 py-0.5 text-xs font-medium">{view.type}</span>
                  {view.status !== "Active" && <span className="rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 text-xs font-medium">{view.status}</span>}
                  {view.archived && <span className="rounded-full bg-gray-800 text-white px-2 py-0.5 text-xs font-medium">Archived</span>}
                  {view.operator && <span className="text-xs text-gray-500">{view.operator}</span>}
                </div>
              )}
              {view && !editing && address && (
                <a href={`https://maps.google.com/?q=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-forest-700 hover:underline min-h-[32px]">
                  <Icon name="pin" className="w-4 h-4 shrink-0" />{address}
                </a>
              )}
            </div>
            {!editing && view && (
              <div className="flex items-center gap-1 shrink-0 w-full md:w-auto justify-end">
                <div className="relative">
                  <button onClick={() => setPdfOpen((o) => !o)} aria-expanded={pdfOpen} className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-500">
                    <Icon name="download" className="w-4 h-4" />PDF
                  </button>
                  {pdfOpen && (
                    <div className="absolute right-0 z-20 mt-1.5 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
                      <p className="text-sm font-semibold text-gray-900">Community Guide PDF</p>
                      <p className="text-xs text-gray-500 mt-0.5">One page, ready to share with movers and the team.</p>
                      <label className="flex items-center gap-3 min-h-[40px] text-sm text-gray-800 mt-2 cursor-pointer">
                        <input type="checkbox" checked={pdfOpts.internal} onChange={(e) => setPdfOpts((o) => ({ ...o, internal: e.target.checked }))} className="w-4 h-4 accent-forest-600" />
                        Include internal notes
                      </label>
                      <label className="flex items-center gap-3 min-h-[40px] text-sm text-gray-800 cursor-pointer">
                        <input type="checkbox" checked={pdfOpts.hideUnknown} onChange={(e) => setPdfOpts((o) => ({ ...o, hideUnknown: e.target.checked }))} className="w-4 h-4 accent-forest-600" />
                        Hide rules still to confirm
                      </label>
                      <button onClick={runPdf} disabled={pdfBusy} className="mt-2 w-full min-h-[44px] rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700 disabled:opacity-60">
                        {pdfBusy ? "Making the PDF..." : "Download PDF"}
                      </button>
                    </div>
                  )}
                </div>
                {canEdit && !view.archived && (
                  <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-forest-500">
                    <Icon name="edit" className="w-4 h-4" />Edit
                  </button>
                )}
                <div className="relative">
                  <button onClick={() => setMenuOpen((o) => !o)} aria-label="More actions" aria-haspopup="menu" aria-expanded={menuOpen} className="w-11 h-11 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-500">
                    <Icon name="more" className="w-4 h-4" />
                  </button>
                  {menuOpen && (
                    <div role="menu" className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
                      <button role="menuitem" onClick={async () => { setMenuOpen(false); try { await navigator.clipboard.writeText(`${window.location.origin}/staff?tab=community&community=${view.id}`); toast("Link copied."); } catch { toast("Couldn't copy the link.", "error"); } }} className="w-full flex items-center gap-2.5 px-3 min-h-[40px] rounded-lg text-sm text-gray-800 hover:bg-gray-50">
                        <Icon name="link" className="w-4 h-4" />Copy link
                      </button>
                      {canArchive && (
                        <button role="menuitem" onClick={() => { setMenuOpen(false); onArchive(view); }} className={cn("w-full flex items-center gap-2.5 px-3 min-h-[40px] rounded-lg text-sm hover:bg-gray-50", view.archived ? "text-gray-800" : "text-red-700")}>
                          <Icon name={view.archived ? "restore" : "archive"} className="w-4 h-4" />{view.archived ? "Restore" : "Archive"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <button onClick={() => requestClose()} aria-label="Close" className="hidden md:inline-flex w-11 h-11 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-500"><Icon name="x" className="w-5 h-5" /></button>
              </div>
            )}
            {editing && <button onClick={() => requestClose()} aria-label="Close" className="hidden md:inline-flex w-11 h-11 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100"><Icon name="x" className="w-5 h-5" /></button>}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
          {loadError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-center gap-3">
              <Icon name="alert" className="w-5 h-5" /><span className="flex-1">{loadError}</span>
              <button onClick={load} className="min-h-[40px] px-3 rounded-lg bg-white border border-red-200 font-medium">Try again</button>
            </div>
          ) : !isNew && !view ? (
            <div className="space-y-3 motion-safe:animate-pulse" aria-busy="true">
              <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-gray-100" />)}</div>
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-12 rounded-xl bg-gray-50" />)}
            </div>
          ) : editing ? (
            <EditForm
              draft={draft}
              setDraft={setDraft}
              errors={errors}
              duplicates={duplicates}
              onOpenDuplicate={(dupId) => requestClose(() => onOpen(dupId))}
              setRule={setRule}
              setRuleMode={setRuleMode}
              focusRule={focusRule}
              isNew={isNew}
            />
          ) : view ? (
            <>
              {/* At a glance */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="rounded-xl bg-[#F6F2E9] p-3.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[#4E5A40]">Move-In Contact</div>
                  {primary ? (
                    <>
                      <div className="text-sm font-semibold text-gray-900 mt-1">{primary.name}</div>
                      {primary.title && <div className="text-xs text-gray-600">{primary.title}</div>}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {primaryPhone && <a href={telHref(primaryPhone.number)} className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl bg-forest-600 text-white text-sm font-semibold"><Icon name="phone" className="w-4 h-4" />{primaryPhone.number}</a>}
                        {primary.email && <a href={`mailto:${primary.email}`} className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl bg-white border border-forest-200 text-forest-800 text-sm font-semibold"><Icon name="mail" className="w-4 h-4" />Email</a>}
                      </div>
                    </>
                  ) : <div className="mt-1.5"><AskChip /></div>}
                </div>
                {RULE_DEFINITIONS.filter((r) => r.glance).map((r) => {
                  const st = ruleStatus(view, r.key);
                  return (
                    <div key={r.key} className="rounded-xl bg-[#F6F2E9] p-3.5">
                      <div className="flex items-center gap-1.5">
                        <Icon name={r.icon} className="w-4 h-4 text-[#4E5A40]" />
                        <span className="text-xs font-semibold uppercase tracking-wide text-[#4E5A40]">{r.shortLabel}</span>
                        {st === "known" && <CopyButton text={view.rules[r.key]} className="ml-auto -my-1" onCopied={() => toast(`${r.shortLabel} copied.`)} />}
                      </div>
                      <div className="mt-1 text-sm text-gray-900 whitespace-pre-line line-clamp-4">
                        {st === "known" ? view.rules[r.key] : st === "not_applicable" ? <span className="text-gray-500">Not applicable</span> : <AskChip />}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Completeness + verified */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-3 rounded-xl border border-gray-100 px-4 py-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="text-xs text-gray-500 mb-1">Move-day rules known</div>
                  <CompletenessBar known={score.known} total={score.total} />
                </div>
                <div className="text-sm">
                  <div className="text-xs text-gray-500">Last verified</div>
                  <div className={cn("flex items-center gap-1", verifiedAge !== null && verifiedAge > STALE_DAYS ? "text-amber-700" : "text-gray-800")}>
                    {verifiedAge !== null && verifiedAge > STALE_DAYS && <Icon name="alert" className="w-3.5 h-3.5" />}
                    {view.lastVerified ? `${view.lastVerified}${view.lastVerifiedBy ? ` by ${view.lastVerifiedBy}` : ""}` : "Not yet"}
                  </div>
                </div>
                {canEdit && !view.archived && (
                  <button onClick={() => quickPatch({ lastVerified: todayIso() }, "Marked verified today.")} className="min-h-[44px] px-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    Mark verified today
                  </button>
                )}
              </div>

              {/* Sections */}
              <Section id="rules" title="Move-Day Rules" open={openSections.rules} onToggle={() => toggle("rules")} count={`${score.known} of ${score.total} known`}>
                <ul className="divide-y divide-gray-100">
                  {RULE_DEFINITIONS.map((r) => {
                    const st = ruleStatus(view, r.key);
                    const value = view.rules[r.key];
                    const text = value;
                    return (
                      <li key={r.key} className="py-3 flex gap-3">
                        <Icon name={r.icon} className="w-5 h-5 text-[#6E7C5C] shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">{r.label}</span>
                            {st === "known" && <CopyButton text={text} className="ml-auto" onCopied={() => toast(`${r.shortLabel} copied.`)} />}
                          </div>
                          {st === "known" ? (
                            <p className="text-sm text-gray-800 mt-0.5 whitespace-pre-line break-words">{text}</p>
                          ) : st === "not_applicable" ? (
                            <p className="text-sm text-gray-500 mt-0.5">Not applicable</p>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <AskChip />
                              {canEdit && !view.archived && (
                                <>
                                  <button onClick={() => { setFocusRule(r.key); setEditing(true); }} className="text-xs font-medium text-forest-700 hover:underline min-h-[32px] px-1">Fill in</button>
                                  <button onClick={() => quickPatch({ ruleStatus: { ...view.ruleStatus, [r.key]: "not_applicable" } }, `${r.shortLabel} marked not applicable.`)} className="text-xs font-medium text-gray-600 hover:underline min-h-[32px] px-1">Mark as confirmed N/A</button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Section>

              <Section id="contacts" title="Contacts" open={openSections.contacts} onToggle={() => toggle("contacts")} count={`${contacts.length}`}>
                <ContactsSection
                  communityId={view.id}
                  contacts={contacts}
                  setContacts={setContacts}
                  canEdit={canEdit && !view.archived}
                  toast={toast}
                  onChanged={refreshActivity}
                />
              </Section>

              <Section id="reference" title="Floor Plans & Reference" open={openSections.reference} onToggle={() => toggle("reference")}>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div><dt className="text-xs text-gray-500">Floor plans on file</dt><dd className="text-gray-900">{view.floorPlansOnFile ? "Yes" : "No"}</dd></div>
                  <div><dt className="text-xs text-gray-500">Website</dt><dd>{view.website ? <a href={view.website} target="_blank" rel="noreferrer" className="text-forest-700 hover:underline break-all">{view.website}</a> : <span className="text-gray-400">None</span>}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-xs text-gray-500">Floor plan notes</dt><dd className="text-gray-900 whitespace-pre-line">{view.floorPlansNotes || <span className="text-gray-400">None</span>}</dd></div>
                  {view.linkedCompanyId && <div><dt className="text-xs text-gray-500">Linked CRM company</dt><dd className="text-gray-900 font-mono text-xs">{view.linkedCompanyId}</dd></div>}
                </dl>
              </Section>

              <Section id="notes" title="Notes & Sources" open={openSections.notes} onToggle={() => toggle("notes")}>
                <dl className="space-y-3 text-sm">
                  <div><dt className="text-xs text-gray-500">Open items</dt><dd className="text-gray-900 whitespace-pre-line">{view.openItems || <span className="text-gray-400">None</span>}</dd></div>
                  <div><dt className="text-xs text-gray-500">Internal notes (TTT only, not on the PDF unless you choose)</dt><dd className="text-gray-900 whitespace-pre-line">{view.internalNotes || <span className="text-gray-400">None</span>}</dd></div>
                  <div><dt className="text-xs text-gray-500">Sources</dt><dd className="text-gray-700 whitespace-pre-line">{view.sourceNotes || <span className="text-gray-400">None</span>}</dd></div>
                </dl>
              </Section>

              <Section id="history" title="History" open={openSections.history} onToggle={() => toggle("history")}>
                {activity.length === 0 ? <p className="text-sm text-gray-500">No history yet.</p> : (
                  <ol className="space-y-2">
                    {activity.map((a) => (
                      <li key={a.id} className="flex gap-3 text-sm">
                        <Icon name="history" className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-gray-900">{a.summary}</div>
                          <div className="text-xs text-gray-500">{a.by.replace(/\s*\(.*\)$/, "")} | {new Date(a.at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Section>
            </>
          ) : null}
        </div>

        {/* Sticky edit footer */}
        {editing && (
          <div className="border-t border-gray-100 bg-white px-4 md:px-6 py-3 flex items-center gap-2">
            <p className="text-xs text-gray-500 mr-auto hidden sm:block">{dirty || isNew ? "Unsaved changes. Cmd or Ctrl + S saves." : "No changes yet."}</p>
            <button
              onClick={() => {
                if (isNew) { requestClose(); return; }
                const reset = () => { setDraft(base); setErrors({}); setEditing(false); setFocusRule(null); };
                if (dirty) setConfirmClose(() => reset); else reset();
              }}
              className="min-h-[44px] px-4 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 ml-auto sm:ml-0"
            >Cancel</button>
            <button
              onClick={save}
              disabled={saving || (!isNew && !dirty) || (isNew && !draft.name.trim())}
              className="min-h-[44px] px-5 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-forest-500"
            >{saving ? "Saving..." : isNew ? "Add community" : "Save"}</button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmClose}
        title="Discard your changes?"
        body="You have edits that aren't saved yet. Discarding them can't be undone."
        confirmLabel="Discard changes"
        tone="danger"
        onCancel={() => setConfirmClose(null)}
        onConfirm={() => { const go = confirmClose!; setConfirmClose(null); setDraft(base); go(); }}
      />
    </div>
  );
}

// ─── Edit form ────────────────────────────────────────────────────────────────

function EditForm({ draft, setDraft, errors, duplicates, onOpenDuplicate, setRule, setRuleMode, focusRule, isNew }: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  errors: Record<string, string>;
  duplicates: { id: string; name: string; archived: boolean }[];
  onOpenDuplicate: (id: string) => void;
  setRule: (k: RuleKey, v: string) => void;
  setRuleMode: (k: RuleKey, m: RuleStatus) => void;
  focusRule: RuleKey | null;
  isNew: boolean;
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  useEffect(() => {
    if (focusRule) document.getElementById(`rule-${focusRule}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusRule]);

  return (
    <div className="space-y-6">
      {duplicates.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex flex-wrap items-center gap-2" role="status">
          <Icon name="alert" className="w-4 h-4" />
          <span>Looks similar to {duplicates.map((d, i) => (
            <span key={d.id}>{i > 0 && " and "}<button onClick={() => onOpenDuplicate(d.id)} className="font-semibold underline underline-offset-2">{d.name}{d.archived ? " (archived)" : ""}</button></span>
          ))}. Open it instead?</span>
        </div>
      )}

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-gray-900 mb-1">Community</legend>
        <Field label="Name (required)" htmlFor="c-name" error={errors.name}>
          <input id="c-name" data-autofocus={!focusRule || undefined} className={inputCls(!!errors.name)} value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. The Roosevelt at Salt Creek" aria-invalid={!!errors.name || undefined} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Type (required)" htmlFor="c-type" error={errors.type}>
            <select id="c-type" className={inputCls(!!errors.type)} value={draft.type} onChange={(e) => set("type", e.target.value as Draft["type"])}>
              {COMMUNITY_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Status" htmlFor="c-status">
            <select id="c-status" className={inputCls()} value={draft.status} onChange={(e) => set("status", e.target.value as Draft["status"])}>
              {COMMUNITY_STATUSES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Operator / management company" htmlFor="c-operator">
          <input id="c-operator" className={inputCls()} value={draft.operator} onChange={(e) => set("operator", e.target.value)} placeholder="e.g. Senior Lifestyle, FirstService Residential" />
        </Field>
        <Field label="Street address" htmlFor="c-street">
          <input id="c-street" className={inputCls()} value={draft.street} onChange={(e) => set("street", e.target.value)} autoComplete="off" />
        </Field>
        <div className="grid grid-cols-[1fr_80px_110px] gap-3">
          <Field label="City" htmlFor="c-city"><input id="c-city" className={inputCls()} value={draft.city} onChange={(e) => set("city", e.target.value)} /></Field>
          <Field label="State" htmlFor="c-state"><input id="c-state" className={inputCls()} value={draft.state} onChange={(e) => set("state", e.target.value.toUpperCase())} maxLength={2} /></Field>
          <Field label="ZIP" htmlFor="c-zip" error={errors.zip}><input id="c-zip" className={inputCls(!!errors.zip)} value={draft.zip} onChange={(e) => set("zip", e.target.value)} inputMode="numeric" /></Field>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-gray-900">Move-Day Rules</legend>
        <p className="text-xs text-gray-500 mb-3">Type what the community told us. If we haven&apos;t asked yet, pick Ask community; if a rule doesn&apos;t apply here, pick Not applicable.</p>
        <div className="space-y-5">
          {RULE_DEFINITIONS.map((r) => {
            const explicit = draft.ruleStatus[r.key];
            const empty = !draft.rules[r.key].trim() || (r.fieldType === "coi" && draft.rules[r.key] === "Unknown");
            const mode: RuleStatus = explicit === "not_applicable" ? "not_applicable" : explicit === "unknown" || empty ? "unknown" : "known";
            return (
              <div key={r.key} id={`rule-${r.key}`} className={cn("rounded-xl", focusRule === r.key && "ring-2 ring-[#C9A96E] ring-offset-4")}>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <Icon name={r.icon} className="w-4 h-4 text-[#6E7C5C]" />
                  <label htmlFor={`rule-input-${r.key}`} className="text-sm font-semibold text-gray-900">{r.label}</label>
                  <div role="radiogroup" aria-label={`${r.label} status`} className="ml-auto inline-flex rounded-lg bg-gray-100 p-0.5 text-xs">
                    {([["known", "Has a rule"], ["unknown", "Ask community"], ["not_applicable", "Not applicable"]] as const).map(([m, l]) => (
                      <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => {
                        setRuleMode(r.key, m);
                        if (m === "known") setTimeout(() => document.getElementById(`rule-input-${r.key}`)?.focus(), 0);
                      }}
                        className={cn("px-2.5 min-h-[32px] rounded-md font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-500", mode === m ? (m === "unknown" ? "bg-amber-100 text-amber-900 shadow-sm" : "bg-white text-gray-900 shadow-sm") : "text-gray-600")}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-1.5">{r.help}</p>
                {r.fieldType === "coi" ? (
                  <select id={`rule-input-${r.key}`} className={inputCls()} value={draft.rules[r.key] || "Unknown"} onChange={(e) => { setRule(r.key, e.target.value); setRuleMode(r.key, e.target.value === "Unknown" ? "unknown" : "known"); }}>
                    {COI_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : mode !== "not_applicable" ? (
                  <AutoTextarea id={`rule-input-${r.key}`} value={draft.rules[r.key]} onChange={(v) => setRule(r.key, v)} autoFocus={focusRule === r.key}
                    placeholder={mode === "unknown" ? "Not known yet. Type here once the community tells us." : ""} invalid={!!errors[`rules.${r.key}`]} />
                ) : null}
              </div>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-gray-900 mb-1">Floor Plans & Reference</legend>
        <label className="flex items-center gap-3 min-h-[44px] text-sm text-gray-800 cursor-pointer">
          <input type="checkbox" checked={draft.floorPlansOnFile} onChange={(e) => set("floorPlansOnFile", e.target.checked)} className="w-4 h-4 accent-forest-600" />
          Floor plans on file
        </label>
        <Field label="Floor plan notes" htmlFor="c-fp"><AutoTextarea id="c-fp" value={draft.floorPlansNotes} onChange={(v) => set("floorPlansNotes", v)} placeholder="e.g. Drive: Dartmouth, Bristol, York" /></Field>
        <Field label="Website" htmlFor="c-web" error={errors.website}>
          <input id="c-web" type="url" className={inputCls(!!errors.website)} value={draft.website} onChange={(e) => set("website", e.target.value.trim())} placeholder="https://" />
        </Field>
        <Field label="Linked CRM company record ID (optional)" htmlFor="c-link" error={errors.linkedCompanyId} hint="For a future link to the referral company. Leave blank if unsure.">
          <input id="c-link" className={inputCls(!!errors.linkedCompanyId)} value={draft.linkedCompanyId} onChange={(e) => set("linkedCompanyId", e.target.value.trim())} placeholder="rec..." />
        </Field>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-gray-900 mb-1">Notes & Sources</legend>
        <Field label="Open items" htmlFor="c-open" hint="What we still need to collect from the community."><AutoTextarea id="c-open" value={draft.openItems} onChange={(v) => set("openItems", v)} /></Field>
        <Field label="Internal notes" htmlFor="c-internal" hint="TTT only. Left off the PDF unless you choose to include them."><AutoTextarea id="c-internal" value={draft.internalNotes} onChange={(v) => set("internalNotes", v)} /></Field>
        <Field label="Sources" htmlFor="c-src" hint="Where this came from, e.g. Email: Jo Idstrom (Oct 20, 2026)."><AutoTextarea id="c-src" value={draft.sourceNotes} onChange={(v) => set("sourceNotes", v)} /></Field>
      </fieldset>
      {isNew && <p className="text-xs text-gray-500">Only the name and type are needed now. You can add contacts once it&apos;s saved.</p>}
    </div>
  );
}
