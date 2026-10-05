"use client";

import type { MarketplaceFieldDef } from "@/lib/marketplace/types";

// Generic field renderer — every category's admin form, live-preview, and
// (eventually) partner self-service form all render from the same
// MarketplaceFieldDef[] through this one component. No category-specific
// JSX anywhere, per the locked spec.
export function FieldInput({
  field,
  value,
  onChange,
}: {
  field: MarketplaceFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const base = "h-9 px-3 rounded-lg border border-gray-700 bg-gray-950 text-sm text-white w-full focus:outline-none focus:ring-2 focus:ring-forest-500/30";
  switch (field.type) {
    case "boolean":
      return (
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          {field.label}
        </label>
      );
    case "select":
      return (
        <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={base}>
          <option value="">—</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case "multiselect": {
      const current = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map((o) => {
            const active = current.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => onChange(active ? current.filter((v) => v !== o) : [...current, o])}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  active ? "bg-forest-600 border-forest-600 text-white" : "border-gray-600 text-gray-400 hover:border-gray-500"
                }`}
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
    case "range":
      return <input type="number" value={(value as number) ?? ""} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} className={base} />;
    case "longtext":
      return <textarea value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} rows={3} className={base} />;
    case "url":
    case "text":
    case "file":
    default:
      return <input type="text" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={base} />;
  }
}
