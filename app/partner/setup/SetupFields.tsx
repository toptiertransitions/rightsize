"use client";

// The partner profile sections, shared by the setup wizard (one per
// screen) and the My Listing page (as editable cards). Mobile first:
// 16px inputs (no iOS zoom), 48px tap targets.

import { useMemo, useRef, useState } from "react";
import { Check, ImagePlus, MapPin, Monitor, Shuffle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IL_COUNTY_OPTIONS } from "@/lib/marketplace/counties";
import type { MarketplaceDeliveryMode, MarketplaceFieldDef } from "@/lib/marketplace/types";
import type { PartnerCriterion } from "@/lib/partners/criteria";

export const inputCls =
  "w-full h-12 px-4 rounded-xl border border-gray-300 text-base bg-white focus:outline-none focus:ring-2 focus:ring-forest-400 placeholder:text-gray-400";
const labelCls = "block text-xs font-medium text-gray-500 mb-1.5";

// ─── Business ────────────────────────────────────────────────────────────────

export interface BusinessData {
  companyName: string;
  pocName: string;
  phone: string;
  website: string;
  city: string;
  state: string;
  zip: string;
}

export function businessValid(d: BusinessData): boolean {
  return d.companyName.trim().length > 0 && d.pocName.trim().length > 0;
}

export function BusinessFields({ data, onChange }: { data: BusinessData; onChange: (d: BusinessData) => void }) {
  const set = (patch: Partial<BusinessData>) => onChange({ ...data, ...patch });
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="p-company" className={labelCls}>Company name</label>
        <input id="p-company" className={inputCls} value={data.companyName} onChange={(e) => set({ companyName: e.target.value })} />
      </div>
      <div>
        <label htmlFor="p-name" className={labelCls}>Your name</label>
        <input id="p-name" className={inputCls} value={data.pocName} onChange={(e) => set({ pocName: e.target.value })} autoComplete="name" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="p-phone" className={labelCls}>Business phone</label>
          <input id="p-phone" type="tel" inputMode="tel" className={inputCls} value={data.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="(630) 555-0100" autoComplete="tel" />
        </div>
        <div>
          <label htmlFor="p-web" className={labelCls}>Website</label>
          <input id="p-web" type="url" inputMode="url" className={inputCls} value={data.website} onChange={(e) => set({ website: e.target.value })} placeholder="yourcompany.com" autoCapitalize="none" />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_72px_96px] gap-3">
        <div>
          <label htmlFor="p-city" className={labelCls}>City</label>
          <input id="p-city" className={inputCls} value={data.city} onChange={(e) => set({ city: e.target.value })} />
        </div>
        <div>
          <label htmlFor="p-state" className={labelCls}>State</label>
          <input id="p-state" className={cn(inputCls, "px-3 uppercase")} maxLength={2} value={data.state} onChange={(e) => set({ state: e.target.value.replace(/[^a-z]/gi, "").slice(0, 2) })} placeholder="IL" />
        </div>
        <div>
          <label htmlFor="p-zip" className={labelCls}>Zip</label>
          <input id="p-zip" inputMode="numeric" className={cn(inputCls, "px-3")} maxLength={5} value={data.zip} onChange={(e) => set({ zip: e.target.value.replace(/\D/g, "").slice(0, 5) })} />
        </div>
      </div>
    </div>
  );
}

// ─── About ───────────────────────────────────────────────────────────────────

export interface AboutData {
  logo: string;
  shortBio: string;
  aboutUs: string;
}

export function AboutFields({ data, onChange }: { data: AboutData; onChange: (d: AboutData) => void }) {
  const set = (patch: Partial<AboutData>) => onChange({ ...data, ...patch });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function upload(file: File) {
    setUploading(true);
    setUploadError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tenantId", "partner-logos");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.photoUrl) throw new Error(json.error || "Upload failed");
      set({ logo: json.photoUrl });
    } catch {
      setUploadError("That didn't upload. Try a different image.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className={labelCls}>Logo</p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-300 bg-white flex items-center justify-center overflow-hidden flex-shrink-0 hover:border-forest-400"
            aria-label={data.logo ? "Change logo" : "Upload logo"}
          >
            {data.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.logo} alt="Your logo" className="w-full h-full object-contain" />
            ) : (
              <ImagePlus className="w-7 h-7 text-gray-400" />
            )}
          </button>
          <div className="text-sm">
            <button type="button" onClick={() => fileRef.current?.click()} className="font-semibold text-forest-600 min-h-[44px]">
              {uploading ? "Uploading…" : data.logo ? "Change logo" : "Upload your logo"}
            </button>
            {data.logo && !uploading && (
              <button type="button" onClick={() => set({ logo: "" })} className="block text-xs text-gray-400 hover:text-gray-600">Remove</button>
            )}
            {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        </div>
      </div>
      <div>
        <label htmlFor="p-short" className={labelCls}>One-line description</label>
        <input id="p-short" className={inputCls} maxLength={160} value={data.shortBio} onChange={(e) => set({ shortBio: e.target.value })} placeholder="Trusted in-home companion care across the western suburbs" />
      </div>
      <div>
        <label htmlFor="p-about" className={labelCls}>About your business</label>
        <textarea
          id="p-about"
          rows={6}
          maxLength={3000}
          value={data.aboutUs}
          onChange={(e) => set({ aboutUs: e.target.value })}
          placeholder="What makes you great for older adults and their families: how long you've been in business, your team, what families say about you."
          className="w-full px-4 py-3 rounded-xl border border-gray-300 text-base bg-white focus:outline-none focus:ring-2 focus:ring-forest-400 placeholder:text-gray-400 resize-none"
        />
        <p className="text-xs text-gray-400 mt-1">Families see this when they tap &ldquo;Learn more&rdquo; on your card.</p>
      </div>
    </div>
  );
}

// ─── Service area ────────────────────────────────────────────────────────────

export interface AreaData {
  deliveryMode: MarketplaceDeliveryMode;
  counties: string[];
  extraZipsText: string;
  statewide: boolean;
}

export function parseZipText(text: string): string[] {
  return [...new Set(text.split(/[,\s]+/).map((z) => z.trim()).filter((z) => /^\d{5}$/.test(z)))];
}

export function areaValid(d: AreaData): boolean {
  if (d.deliveryMode === "Virtual") return true;
  return d.statewide || d.counties.length > 0 || parseZipText(d.extraZipsText).length > 0;
}

const MODES: { key: MarketplaceDeliveryMode; label: string; desc: string; icon: React.ReactNode }[] = [
  { key: "In-person", label: "In person", desc: "We visit clients or their homes", icon: <MapPin className="w-5 h-5" /> },
  { key: "Virtual", label: "Virtual", desc: "Phone or video, anywhere", icon: <Monitor className="w-5 h-5" /> },
  { key: "Both", label: "Both", desc: "In person locally, virtual beyond", icon: <Shuffle className="w-5 h-5" /> },
];

export function AreaFields({ data, onChange }: { data: AreaData; onChange: (d: AreaData) => void }) {
  const set = (patch: Partial<AreaData>) => onChange({ ...data, ...patch });
  const [query, setQuery] = useState("");
  const [showZips, setShowZips] = useState(data.extraZipsText.trim().length > 0);
  const nameByKey = useMemo(() => new Map(IL_COUNTY_OPTIONS.map((c) => [c.key, c.name])), []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const avail = IL_COUNTY_OPTIONS.filter((c) => !data.counties.includes(c.key));
    return [
      ...avail.filter((c) => c.name.toLowerCase().startsWith(q)),
      ...avail.filter((c) => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q)),
    ].slice(0, 6);
  }, [query, data.counties]);

  return (
    <div className="space-y-6">
      <div>
        <p className={labelCls}>How do you work with clients?</p>
        <div className="grid gap-2">
          {MODES.map((m) => {
            const on = data.deliveryMode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => set({ deliveryMode: m.key })}
                className={cn(
                  "flex items-center gap-3 min-h-[56px] px-4 rounded-2xl border text-left transition-all active:scale-[0.99]",
                  on ? "border-forest-500 bg-forest-50 ring-1 ring-forest-500" : "border-gray-200 bg-white"
                )}
              >
                <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", on ? "bg-forest-600 text-white" : "bg-gray-100 text-gray-500")}>{m.icon}</span>
                <span className="flex-1">
                  <span className="block text-[15px] font-semibold text-gray-900">{m.label}</span>
                  <span className="block text-xs text-gray-500">{m.desc}</span>
                </span>
                {on && <Check className="w-5 h-5 text-forest-600" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </div>

      {data.deliveryMode !== "Virtual" && (
        <div>
          <p className={labelCls}>Which Illinois counties do you serve?</p>
          {data.counties.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {data.counties.map((k) => (
                <span key={k} className="inline-flex items-center gap-1 pl-3 pr-1 h-9 rounded-full bg-forest-600 text-white text-sm">
                  {nameByKey.get(k) ?? k}
                  <button type="button" onClick={() => set({ counties: data.counties.filter((c) => c !== k) })} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/20" aria-label={`Remove ${nameByKey.get(k) ?? k}`}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a county, like DuPage" />
          {matches.length > 0 && (
            <div className="mt-2 bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {matches.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => { set({ counties: [...data.counties, c.key] }); setQuery(""); }}
                  className="w-full text-left px-4 min-h-[48px] text-sm text-gray-800 hover:bg-gray-50"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          <label className="mt-4 flex items-center gap-3 min-h-[44px] text-sm text-gray-700">
            <input type="checkbox" className="w-5 h-5 accent-forest-600" checked={data.statewide} onChange={(e) => set({ statewide: e.target.checked })} />
            We serve all of Illinois
          </label>

          {showZips ? (
            <div className="mt-3">
              <label htmlFor="p-zips" className={labelCls}>Other zip codes you serve</label>
              <textarea
                id="p-zips"
                rows={2}
                value={data.extraZipsText}
                onChange={(e) => set({ extraZipsText: e.target.value })}
                placeholder="60540, 60563"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 text-base bg-white focus:outline-none focus:ring-2 focus:ring-forest-400 placeholder:text-gray-400 resize-none"
              />
            </div>
          ) : (
            <button type="button" onClick={() => setShowZips(true)} className="mt-1 text-sm font-medium text-forest-600 min-h-[44px]">
              + Add specific zip codes
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Matching criteria (one question) ────────────────────────────────────────

export function CriterionPicker({ criterion, selected, onChange }: { criterion: PartnerCriterion; selected: string[]; onChange: (v: string[]) => void }) {
  const allOn = selected.length === criterion.options.length;
  return (
    <div>
      <div className="flex flex-col gap-2" role="group" aria-label={criterion.prompt}>
        {criterion.options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
              className={cn(
                "flex items-center justify-between gap-3 min-h-[52px] px-4 rounded-2xl border text-left text-[15px] font-medium transition-all active:scale-[0.99]",
                on ? "border-forest-500 bg-forest-50 ring-1 ring-forest-500 text-gray-900" : "border-gray-200 bg-white text-gray-700"
              )}
            >
              {o.label}
              <span className={cn("w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0", on ? "bg-forest-600 border-forest-600 text-white" : "border-gray-300")}>
                {on && <Check className="w-3 h-3" strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => onChange(allOn ? [] : criterion.options.map((o) => o.value))}
        className="mt-3 text-sm font-medium text-forest-600 min-h-[44px]"
      >
        {allOn ? "Clear all" : "Select all"}
      </button>
    </div>
  );
}

// ─── Category details (the admin-defined field schema) ───────────────────────

// Category fields partners don't fill in themselves (setup and My Listing).
// Admins still see and edit them on the marketplace admin pages, and any
// saved values are kept.
const PARTNER_HIDDEN_FIELDS: Record<string, string[]> = {
  // Visit length is already asked on the "Which visit lengths do you offer?" screen
  "Companion Care": ["rateRange", "minimumHours", "agencyOrIndependent"],
};

export function editableFields(schema: MarketplaceFieldDef[], categoryLabel?: string): MarketplaceFieldDef[] {
  const hidden = new Set(categoryLabel ? PARTNER_HIDDEN_FIELDS[categoryLabel] ?? [] : []);
  return schema.filter((f) => f.type !== "file" && !hidden.has(f.key));
}

export function DetailsFields({ schema, values, onChange }: { schema: MarketplaceFieldDef[]; values: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-5">
      {editableFields(schema).map((f) => (
        <div key={f.key}>
          {f.type !== "boolean" && (
            <label className={labelCls}>
              {f.label}
              {!f.required && <span className="text-gray-400 font-normal"> (optional)</span>}
            </label>
          )}
          <PartnerFieldInput field={f} value={values[f.key]} onChange={(v) => onChange({ ...values, [f.key]: v })} />
          {f.helpText && <p className="text-xs text-gray-400 mt-1">{f.helpText}</p>}
        </div>
      ))}
    </div>
  );
}

function PartnerFieldInput({ field, value, onChange }: { field: MarketplaceFieldDef; value: unknown; onChange: (v: unknown) => void }) {
  switch (field.type) {
    case "boolean": {
      const v = value === true ? "yes" : value === false ? "no" : "";
      return (
        <div>
          <p className={labelCls}>{field.label}</p>
          <div className="grid grid-cols-2 gap-2">
            {(["yes", "no"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(opt === "yes")}
                className={cn(
                  "h-12 rounded-xl border text-[15px] font-semibold transition-all",
                  v === opt ? "border-forest-600 bg-forest-600 text-white" : "border-gray-200 bg-white text-gray-700"
                )}
              >
                {opt === "yes" ? "Yes" : "No"}
              </button>
            ))}
          </div>
        </div>
      );
    }
    case "select":
      return (
        <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          <option value="">Choose one</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case "multiselect": {
      const current = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((o) => {
            const on = current.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => onChange(on ? current.filter((x) => x !== o) : [...current, o])}
                className={cn(
                  "min-h-[44px] px-4 rounded-full border text-sm font-medium transition-all",
                  on ? "border-forest-500 bg-forest-600 text-white" : "border-gray-300 bg-white text-gray-600"
                )}
              >
                {o}
              </button>
            );
          })}
        </div>
      );
    }
    case "number":
    case "currency":
    case "range": {
      // Empty for zero/unset, select on focus (never a sticky "0")
      const shown = typeof value === "number" && value !== 0 ? String(value) : "";
      return (
        <input
          type="text"
          inputMode="decimal"
          value={shown}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9.]/g, "");
            onChange(raw === "" ? undefined : Number(raw));
          }}
          placeholder={field.type === "currency" ? "$" : ""}
          className={inputCls}
        />
      );
    }
    case "longtext":
      return (
        <textarea
          rows={3}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-gray-300 text-base bg-white focus:outline-none focus:ring-2 focus:ring-forest-400 resize-none"
        />
      );
    case "url":
      return <input type="url" inputMode="url" autoCapitalize="none" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
    default:
      return <input type="text" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
  }
}
