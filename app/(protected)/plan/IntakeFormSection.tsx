"use client";

import { useState, useEffect } from "react";
import type { IntakeForm } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const BRING_ITEMS = [
  "Hard copy of signed client agreement",
  "Floor plan",
  "Measuring tape (if applicable)",
  "Clipboard and printed checklist",
  "Business cards",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasAnyData(form: IntakeForm): boolean {
  const meta = new Set<string>(["updatedAt", "updatedByName", "updatedByEmail"]);
  return Object.entries(form).some(([k, v]) => !meta.has(k) && v !== undefined && v !== "" && v !== null);
}

function fmtTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

const yn = (v?: boolean) => (v === true ? "Yes" : v === false ? "No" : null);

// ─── Shared style tokens ──────────────────────────────────────────────────────

const inputCls =
  "w-full h-10 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-400";
const shortInputCls =
  "h-10 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-400";
const numberCls =
  "w-20 h-9 px-2 rounded-xl border border-gray-300 text-sm text-center focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent bg-white text-gray-900";
const textareaCls =
  "w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-400 resize-none";

// ─── Mini sub-components ──────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 pt-5 pb-2 border-b border-gray-100 mb-1">
      {children}
    </p>
  );
}

function YesNo({ value, onChange }: { value?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-1 shrink-0">
      {(["Yes", "No"] as const).map((label) => {
        const active = label === "Yes" ? value === true : value === false;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onChange(label === "Yes")}
            className={`h-8 px-3.5 rounded-full text-xs font-medium border transition-colors ${
              active
                ? "bg-forest-600 text-white border-forest-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function InlineRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between min-h-[44px] py-1 gap-4">
      <span className="text-sm text-gray-700">{label}</span>
      {children}
    </div>
  );
}

function StackedRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <p className="text-xs font-medium text-gray-500 mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function ConditionalField({ show, children }: { show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <div className="ml-4 mt-1 mb-2 pl-3 border-l-2 border-forest-200">
      {children}
    </div>
  );
}

// ─── Read-only view ───────────────────────────────────────────────────────────

function ReadValue({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="py-1.5">
      <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-800 mt-0.5 whitespace-pre-wrap">{String(value)}</p>
    </div>
  );
}

function ReadSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 pb-1.5 border-b border-gray-100 mb-2">
        {title}
      </p>
      <div className="grid sm:grid-cols-2 gap-x-8">{children}</div>
    </div>
  );
}

function ReadOnlyView({ form, onEdit }: { form: IntakeForm; onEdit: () => void }) {
  return (
    <div className="pt-4">
      <ReadSection title="Home Details (Current Space)">
        <ReadValue label="Bedrooms" value={form.bedrooms} />
        <ReadValue label="Kitchen" value={yn(form.hasKitchen)} />
        <ReadValue label="Dining Room" value={yn(form.hasDiningRoom)} />
        <ReadValue label="Living Spaces" value={form.numLivingSpaces} />
        <ReadValue label="Bathrooms" value={form.numBathrooms} />
        <ReadValue label="Basement" value={yn(form.hasBasement)} />
        <ReadValue label="Attic" value={yn(form.hasAttic)} />
        <ReadValue label="Garbage / Recycling Day" value={form.garbageDay} />
        {form.homeDetailsNotes && (
          <div className="sm:col-span-2">
            <ReadValue label="Notes" value={form.homeDetailsNotes} />
          </div>
        )}
      </ReadSection>

      <ReadSection title="Timeline & Move Planning">
        <ReadValue label="Timeframe" value={form.timeframe} />
        <ReadValue label="Financial takeover date" value={fmtDate(form.financialTakeoverDate)} />
        <ReadValue label="Begin packing / sorting" value={fmtDate(form.beginPackingDate)} />
        <ReadValue label="Ideal move-in date" value={fmtDate(form.moveInDate)} />
        <ReadValue label="Selling current home" value={yn(form.sellingCurrentHome)} />
        {form.sellingCurrentHome && <ReadValue label="Closing date" value={fmtDate(form.closingDate)} />}
        <ReadValue label="Movers to family / friend" value={yn(form.moversToFamily)} />
        {form.moversToFamily && (
          <div className="sm:col-span-2">
            <ReadValue label="Family / friend address & contact" value={form.moversToFamilyDetails} />
          </div>
        )}
        <ReadValue label="Movers to storage facility" value={yn(form.moversToStorage)} />
        {form.moversToStorage && <ReadValue label="Storage location" value={form.storageLocation} />}
      </ReadSection>

      <ReadSection title="Special Considerations">
        {form.medicalDevices && (
          <div className="sm:col-span-2">
            <ReadValue label="Medical devices / assistive equipment" value={form.medicalDevices} />
          </div>
        )}
        {form.giftItems && (
          <div className="sm:col-span-2">
            <ReadValue label="Items to gift to family / friends" value={form.giftItems} />
          </div>
        )}
        {form.sentimentalItems && (
          <div className="sm:col-span-2">
            <ReadValue label="Sentimental belongings / keepsakes" value={form.sentimentalItems} />
          </div>
        )}
        {form.itemsToSell && (
          <div className="sm:col-span-2">
            <ReadValue label="Items to sell" value={form.itemsToSell} />
          </div>
        )}
        <ReadValue label="Storage needed / arranged" value={yn(form.storageNeeded)} />
        {form.storageNeeded && <ReadValue label="Storage details" value={form.storageDetails} />}
        {form.additionalNotes && (
          <div className="sm:col-span-2">
            <ReadValue label="Additional notes" value={form.additionalNotes} />
          </div>
        )}
      </ReadSection>

      <div className="pt-2 border-t border-gray-100 flex justify-end">
        <button
          type="button"
          onClick={onEdit}
          className="h-9 px-4 rounded-xl text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Edit Form
        </button>
      </div>
    </div>
  );
}

// ─── Edit form ────────────────────────────────────────────────────────────────

interface EditFormProps {
  form: IntakeForm;
  setField: <K extends keyof IntakeForm>(key: K, value: IntakeForm[K]) => void;
  bringChecked: boolean[];
  setBringChecked: React.Dispatch<React.SetStateAction<boolean[]>>;
  onSave: () => void;
  onCancel?: () => void;
  saving: boolean;
}

function EditForm({ form, setField, bringChecked, setBringChecked, onSave, onCancel, saving }: EditFormProps) {
  return (
    <div>
      {/* ── What to Bring ─────────────────────────────────────────────── */}
      <SectionLabel>What to Bring</SectionLabel>
      <div className="space-y-2 mb-1">
        {BRING_ITEMS.map((item, i) => (
          <label key={item} className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={bringChecked[i]}
              onChange={(e) =>
                setBringChecked((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))
              }
              className="w-4 h-4 rounded border-gray-300 text-forest-600 focus:ring-forest-500 accent-forest-600"
            />
            <span
              className={`text-sm transition-colors ${
                bringChecked[i] ? "text-gray-700" : "text-gray-400 line-through"
              }`}
            >
              {item}
            </span>
          </label>
        ))}
      </div>
      <p className="text-xs text-gray-400 italic mb-1">These reminders are not saved.</p>

      {/* ── Home Details ──────────────────────────────────────────────── */}
      <SectionLabel>Home Details (Current Space)</SectionLabel>
      <div className="divide-y divide-gray-50">
        <InlineRow label="Number of Bedrooms">
          <input
            type="number" min={0} max={30}
            value={form.bedrooms ?? ""}
            onChange={(e) => setField("bedrooms", e.target.value === "" ? undefined : Number(e.target.value))}
            className={numberCls}
          />
        </InlineRow>
        <InlineRow label="Kitchen">
          <YesNo value={form.hasKitchen} onChange={(v) => setField("hasKitchen", v)} />
        </InlineRow>
        <InlineRow label="Dining Room">
          <YesNo value={form.hasDiningRoom} onChange={(v) => setField("hasDiningRoom", v)} />
        </InlineRow>
        <InlineRow label="Number of Living Spaces">
          <input
            type="number" min={0} max={20}
            value={form.numLivingSpaces ?? ""}
            onChange={(e) => setField("numLivingSpaces", e.target.value === "" ? undefined : Number(e.target.value))}
            className={numberCls}
          />
        </InlineRow>
        <InlineRow label="Number of Bathrooms">
          <input
            type="number" min={0} max={20} step={0.5}
            value={form.numBathrooms ?? ""}
            onChange={(e) => setField("numBathrooms", e.target.value === "" ? undefined : Number(e.target.value))}
            className={numberCls}
          />
        </InlineRow>
        <InlineRow label="Basement">
          <YesNo value={form.hasBasement} onChange={(v) => setField("hasBasement", v)} />
        </InlineRow>
        <InlineRow label="Attic">
          <YesNo value={form.hasAttic} onChange={(v) => setField("hasAttic", v)} />
        </InlineRow>
        <InlineRow label="Garbage / Recycling Day">
          <input
            type="text" placeholder="e.g. Tuesday"
            value={form.garbageDay ?? ""}
            onChange={(e) => setField("garbageDay", e.target.value || undefined)}
            className={`${shortInputCls} w-40`}
          />
        </InlineRow>
      </div>
      <div className="mt-1">
        <StackedRow label="Notes">
          <textarea
            rows={3} placeholder="Additional notes about the home..."
            value={form.homeDetailsNotes ?? ""}
            onChange={(e) => setField("homeDetailsNotes", e.target.value || undefined)}
            className={textareaCls}
          />
        </StackedRow>
      </div>

      {/* ── Timeline & Move Planning ──────────────────────────────────── */}
      <SectionLabel>Timeline & Move Planning</SectionLabel>
      <StackedRow label="Timeframe we are working within">
        <input
          type="text" placeholder="e.g. 8–10 weeks"
          value={form.timeframe ?? ""}
          onChange={(e) => setField("timeframe", e.target.value || undefined)}
          className={inputCls}
        />
      </StackedRow>
      <StackedRow label="Financial takeover date at new home">
        <input
          type="date"
          value={form.financialTakeoverDate ?? ""}
          onChange={(e) => setField("financialTakeoverDate", e.target.value || undefined)}
          className={inputCls}
        />
      </StackedRow>
      <StackedRow label="Preferred date to begin packing / sorting">
        <input
          type="date"
          value={form.beginPackingDate ?? ""}
          onChange={(e) => setField("beginPackingDate", e.target.value || undefined)}
          className={inputCls}
        />
      </StackedRow>
      <StackedRow label="Ideal move-in date">
        <input
          type="date"
          value={form.moveInDate ?? ""}
          onChange={(e) => setField("moveInDate", e.target.value || undefined)}
          className={inputCls}
        />
      </StackedRow>
      <div className="divide-y divide-gray-50 mt-1">
        <div>
          <InlineRow label="Selling current home?">
            <YesNo value={form.sellingCurrentHome} onChange={(v) => setField("sellingCurrentHome", v)} />
          </InlineRow>
          <ConditionalField show={form.sellingCurrentHome === true}>
            <StackedRow label="Closing date">
              <input
                type="date"
                value={form.closingDate ?? ""}
                onChange={(e) => setField("closingDate", e.target.value || undefined)}
                className={inputCls}
              />
            </StackedRow>
          </ConditionalField>
        </div>
        <div>
          <InlineRow label="Movers delivering to a family / friend's home?">
            <YesNo value={form.moversToFamily} onChange={(v) => setField("moversToFamily", v)} />
          </InlineRow>
          <ConditionalField show={form.moversToFamily === true}>
            <StackedRow label="Address / contact">
              <textarea
                rows={2} placeholder="Name, address, phone number..."
                value={form.moversToFamilyDetails ?? ""}
                onChange={(e) => setField("moversToFamilyDetails", e.target.value || undefined)}
                className={textareaCls}
              />
            </StackedRow>
          </ConditionalField>
        </div>
        <div>
          <InlineRow label="Movers delivering to a storage facility?">
            <YesNo value={form.moversToStorage} onChange={(v) => setField("moversToStorage", v)} />
          </InlineRow>
          <ConditionalField show={form.moversToStorage === true}>
            <StackedRow label="Storage facility location">
              <input
                type="text" placeholder="Facility name and address..."
                value={form.storageLocation ?? ""}
                onChange={(e) => setField("storageLocation", e.target.value || undefined)}
                className={inputCls}
              />
            </StackedRow>
          </ConditionalField>
        </div>
      </div>

      {/* ── Special Considerations ────────────────────────────────────── */}
      <SectionLabel>Special Considerations</SectionLabel>
      <div className="space-y-1">
        <StackedRow label="Medical devices or assistive equipment to be mindful of">
          <textarea
            rows={2} placeholder="e.g. walker, wheelchair, oxygen concentrator..."
            value={form.medicalDevices ?? ""}
            onChange={(e) => setField("medicalDevices", e.target.value || undefined)}
            className={textareaCls}
          />
        </StackedRow>
        <StackedRow label="Items to gift to family / friends">
          <textarea
            rows={2} placeholder="Describe items and intended recipients..."
            value={form.giftItems ?? ""}
            onChange={(e) => setField("giftItems", e.target.value || undefined)}
            className={textareaCls}
          />
        </StackedRow>
        <StackedRow label="Sentimental belongings or keepsakes requiring special care">
          <textarea
            rows={2} placeholder="Photos, heirlooms, documents..."
            value={form.sentimentalItems ?? ""}
            onChange={(e) => setField("sentimentalItems", e.target.value || undefined)}
            className={textareaCls}
          />
        </StackedRow>
        <StackedRow label="Items to be sold — estate sale, consignment, etc.">
          <textarea
            rows={2} placeholder="Furniture, jewelry, artwork..."
            value={form.itemsToSell ?? ""}
            onChange={(e) => setField("itemsToSell", e.target.value || undefined)}
            className={textareaCls}
          />
        </StackedRow>
      </div>
      <div className="divide-y divide-gray-50 mt-1">
        <div>
          <InlineRow label="Storage facility needed or already arranged?">
            <YesNo value={form.storageNeeded} onChange={(v) => setField("storageNeeded", v)} />
          </InlineRow>
          <ConditionalField show={form.storageNeeded === true}>
            <StackedRow label="Storage details">
              <input
                type="text" placeholder="Facility name, unit size, arrangement status..."
                value={form.storageDetails ?? ""}
                onChange={(e) => setField("storageDetails", e.target.value || undefined)}
                className={inputCls}
              />
            </StackedRow>
          </ConditionalField>
        </div>
      </div>
      <div className="mt-1">
        <StackedRow label="Additional notes from visit">
          <textarea
            rows={3} placeholder="Any other observations or client preferences..."
            value={form.additionalNotes ?? ""}
            onChange={(e) => setField("additionalNotes", e.target.value || undefined)}
            className={textareaCls}
          />
        </StackedRow>
      </div>

      {/* ── Actions ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2 pt-5 mt-4 border-t border-gray-100">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-9 px-4 rounded-xl text-sm text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="h-9 px-5 rounded-xl text-sm font-medium bg-forest-600 text-white hover:bg-forest-700 disabled:opacity-60 transition-colors"
        >
          {saving ? "Saving…" : "Save Intake Form"}
        </button>
      </div>
    </div>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────

interface Props {
  tenantId: string;
}

export function IntakeFormSection({ tenantId }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"loading" | "view" | "edit">("loading");
  const [form, setForm] = useState<IntakeForm>({});
  const [saved, setSaved] = useState<IntakeForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [bringChecked, setBringChecked] = useState<boolean[]>(BRING_ITEMS.map(() => true));

  function setField<K extends keyof IntakeForm>(key: K, value: IntakeForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Load form on mount
  useEffect(() => {
    fetch(`/api/intake?tenantId=${encodeURIComponent(tenantId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.form && hasAnyData(d.form)) {
          setSaved(d.form);
          setForm(d.form);
          setMode("view");
        } else {
          setMode("edit");
        }
      })
      .catch(() => setMode("edit"));
  }, [tenantId]);

  // Auto-dismiss toast after 4 s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/intake", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSaved(data.form);
      setForm(data.form);
      setMode("view");
      setToast({ msg: "Intake form saved successfully", ok: true });
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : "Save failed", ok: false });
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (saved && hasAnyData(saved)) {
      setForm(saved);
      setMode("view");
    }
  }

  const hasData = saved && hasAnyData(saved);

  return (
    <>
      <div className="mt-8 bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        {/* ── Collapse toggle header ─────────────────────────────────── */}
        <button
          type="button"
          onClick={() => setIsOpen((p) => !p)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0">
              <svg
                className="w-5 h-5 text-indigo-500"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">First Visit Intake</p>
              {hasData && saved?.updatedAt ? (
                <p className="text-xs text-gray-400 mt-0.5">
                  Last updated by {saved.updatedByName || "staff"} on {fmtTimestamp(saved.updatedAt)}
                </p>
              ) : (
                <p className="text-xs text-gray-400 mt-0.5">Not yet completed</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {hasData && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-forest-700 bg-forest-50 border border-forest-200 rounded-full px-2.5 py-0.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Completed
              </span>
            )}
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {/* ── Body ──────────────────────────────────────────────────── */}
        {isOpen && (
          <div className="border-t border-gray-100 px-6 pb-6">
            {mode === "loading" && (
              <div className="py-10 text-center text-sm text-gray-400">Loading…</div>
            )}
            {mode === "view" && saved && (
              <ReadOnlyView form={saved} onEdit={() => setMode("edit")} />
            )}
            {mode === "edit" && (
              <EditForm
                form={form}
                setField={setField}
                bringChecked={bringChecked}
                setBringChecked={setBringChecked}
                onSave={handleSave}
                onCancel={saved && hasAnyData(saved) ? handleCancel : undefined}
                saving={saving}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Toast notification ─────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium animate-fade-in ${
            toast.ok
              ? "bg-white text-forest-800 border-forest-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          {toast.ok ? (
            <svg className="w-4 h-4 text-forest-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {toast.msg}
        </div>
      )}
    </>
  );
}
