"use client";

import { useState } from "react";
import type { MarketplaceCategory, MarketplaceFieldDef, MarketplaceFieldType } from "@/lib/marketplace/types";
import { FieldInput } from "../FieldInput";
import { getPartnerCriteria } from "@/lib/partners/criteria";
import type { PartnerCategory } from "@/lib/types";
import {
  updateCategoryFieldSchemaAction,
  updateCategoryBasicInfoAction,
  updateCategoryReferralPolicyAction,
} from "../actions";

const FIELD_TYPES: MarketplaceFieldType[] = ["text", "longtext", "number", "select", "multiselect", "boolean", "currency", "range", "url", "file"];

function blankField(): MarketplaceFieldDef {
  return { key: "", label: "", type: "text" };
}

export function CategoriesClient({ categories, canEdit }: { categories: MarketplaceCategory[]; canEdit: boolean }) {
  const [selectedId, setSelectedId] = useState(categories[0]?.id ?? "");
  const selected = categories.find((c) => c.id === selectedId);

  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-4">Categories</h1>
      <div className="grid grid-cols-[220px_1fr] gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-800/60 last:border-0 transition-colors ${
                c.id === selectedId ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800/40"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {selected && <CategoryEditor key={selected.id} category={selected} canEdit={canEdit} />}
      </div>
    </div>
  );
}

function CategoryEditor({ category, canEdit }: { category: MarketplaceCategory; canEdit: boolean }) {
  const [basic, setBasic] = useState({
    label: category.label,
    description: category.description,
    icon: category.icon,
    minLiveListings: category.minLiveListings,
    allowsVirtual: category.allowsVirtual,
  });
  const [fields, setFields] = useState<MarketplaceFieldDef[]>(category.fieldSchema);
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  function updateField(i: number, patch: Partial<MarketplaceFieldDef>) {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function moveField(i: number, dir: -1 | 1) {
    setFields((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function removeField(i: number) {
    setFields((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function saveBasic() {
    setSaving(true);
    setMsg("");
    const result = await updateCategoryBasicInfoAction(category.id, basic);
    setSaving(false);
    setMsg(result.ok ? "Saved." : result.error);
  }

  async function saveFields() {
    setSaving(true);
    setMsg("");
    const result = await updateCategoryFieldSchemaAction(category.id, fields);
    setSaving(false);
    setMsg(result.ok ? "Saved." : result.error);
  }

  if (!canEdit) {
    return <p className="text-sm text-gray-500">Category editing requires TTTAdmin.</p>;
  }

  return (
    <div className="space-y-8">
      {/* Basic info */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Basic Info</h2>
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Label</label>
            <input className="h-9 px-3 rounded-lg border border-gray-700 bg-gray-950 text-sm text-white w-full" value={basic.label} onChange={(e) => setBasic({ ...basic, label: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Min. Live Listings to Show Publicly</label>
            <input type="number" className="h-9 px-3 rounded-lg border border-gray-700 bg-gray-950 text-sm text-white w-full" value={basic.minLiveListings} onChange={(e) => setBasic({ ...basic, minLiveListings: Number(e.target.value) })} />
          </div>
        </div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Description</label>
        <textarea className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-950 text-sm text-white mb-3" rows={2} value={basic.description} onChange={(e) => setBasic({ ...basic, description: e.target.value })} />
        <label className="flex items-center gap-2 text-sm text-gray-300 mb-3">
          <input type="checkbox" checked={basic.allowsVirtual} onChange={(e) => setBasic({ ...basic, allowsVirtual: e.target.checked })} />
          Allows virtual service (statewide/nationwide service area is meaningful for this category)
        </label>
        <button onClick={saveBasic} disabled={saving} className="h-9 px-4 rounded-lg bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 disabled:opacity-50">
          {saving ? "Saving…" : "Save Basic Info"}
        </button>
      </section>

      <MatchingCriteriaPreview category={category} />

      {/* Field schema builder */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Field Schema</h2>
          <button onClick={() => setFields([...fields, blankField()])} className="text-sm px-3 py-1 rounded-md border border-gray-600 text-gray-300 hover:bg-gray-800">
            + Add Field
          </button>
        </div>
        <div className="space-y-3">
          {fields.map((field, i) => (
            <div key={i} className="bg-gray-950 border border-gray-800 rounded-lg p-3">
              <div className="grid grid-cols-[1fr_1fr_120px_auto] gap-2 mb-2">
                <input placeholder="Key (e.g. fiduciary)" className="h-8 px-2 rounded border border-gray-700 bg-gray-900 text-xs text-white" value={field.key} onChange={(e) => updateField(i, { key: e.target.value })} />
                <input placeholder="Label" className="h-8 px-2 rounded border border-gray-700 bg-gray-900 text-xs text-white" value={field.label} onChange={(e) => updateField(i, { label: e.target.value })} />
                <select className="h-8 px-2 rounded border border-gray-700 bg-gray-900 text-xs text-white" value={field.type} onChange={(e) => updateField(i, { type: e.target.value as MarketplaceFieldType })}>
                  {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <div className="flex items-center gap-1">
                  <button onClick={() => moveField(i, -1)} className="w-7 h-7 text-xs text-gray-400 hover:text-white">↑</button>
                  <button onClick={() => moveField(i, 1)} className="w-7 h-7 text-xs text-gray-400 hover:text-white">↓</button>
                  <button onClick={() => removeField(i)} className="w-7 h-7 text-xs text-red-400 hover:text-red-300">✕</button>
                </div>
              </div>
              {(field.type === "select" || field.type === "multiselect") && (
                <input
                  placeholder="Options (comma-separated)"
                  className="h-8 px-2 rounded border border-gray-700 bg-gray-900 text-xs text-white w-full mb-2"
                  value={(field.options ?? []).join(", ")}
                  onChange={(e) => updateField(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                />
              )}
              <div className="flex gap-4">
                {([
                  ["required", "Required for Live"],
                  ["filterable", "Filterable"],
                  ["showOnCard", "Show on Card"],
                  ["showOnProfile", "Show on Profile"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-1.5 text-xs text-gray-400">
                    <input type="checkbox" checked={Boolean(field[key])} onChange={(e) => updateField(i, { [key]: e.target.checked })} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button onClick={saveFields} disabled={saving} className="h-9 px-4 rounded-lg bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 disabled:opacity-50">
            {saving ? "Saving…" : "Save Field Schema"}
          </button>
          {msg && <span className="text-xs text-gray-500">{msg}</span>}
        </div>
      </section>

      {/* Live preview */}
      <section>
        <h2 className="text-sm font-semibold text-white mb-4">Live Preview</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Admin Form</h3>
            <div className="space-y-3">
              {fields.map((f) => (
                <div key={f.key || f.label}>
                  <label className="block text-xs font-medium text-gray-400 mb-1">{f.label || "(unlabeled)"}{f.required && <span className="text-red-400"> *</span>}</label>
                  <FieldInput field={f} value={previewValues[f.key]} onChange={(v) => setPreviewValues({ ...previewValues, [f.key]: v })} />
                </div>
              ))}
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Public Filters</h3>
            <div className="flex flex-wrap gap-2">
              {fields.filter((f) => f.filterable).map((f) => (
                <span key={f.key} className="text-xs px-2.5 py-1 rounded-full border border-gray-700 text-gray-300">{f.label}</span>
              ))}
              {fields.filter((f) => f.filterable).length === 0 && <p className="text-xs text-gray-500">No filterable fields yet.</p>}
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Partner Card</h3>
            <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
              <div className="w-8 h-8 rounded-full bg-gray-800 mb-2" />
              <p className="text-sm font-medium text-gray-200">Example Company</p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {fields.filter((f) => f.showOnCard).map((f) => (
                  <span key={f.key} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{f.label}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <ReferralPolicyEditor category={category} />
    </div>
  );
}

function ReferralPolicyEditor({ category }: { category: MarketplaceCategory }) {
  const [feesAllowed, setFeesAllowed] = useState(category.referralPolicy.feesAllowed);
  const [requiresDisclosure, setRequiresDisclosure] = useState(category.referralPolicy.requiresDisclosure);
  const [disclosureText, setDisclosureText] = useState(category.referralPolicy.disclosureText);
  const [creditAllowed, setCreditAllowed] = useState(category.referralPolicy.creditToSeniorAllowed);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const turningFeesOn = feesAllowed && !category.referralPolicy.feesAllowed;

  async function save() {
    setSaving(true);
    setMsg("");
    if (turningFeesOn && !confirmed) {
      setSaving(false);
      setMsg("Confirm with counsel before enabling fees for this category.");
      return;
    }
    const result = await updateCategoryReferralPolicyAction(category.id, {
      feesAllowed,
      requiresDisclosure,
      disclosureText,
      creditToSeniorAllowed: creditAllowed,
    });
    setSaving(false);
    setMsg(result.ok ? "Saved." : result.error);
  }

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-white mb-4">Referral Policy</h2>
      <label className="flex items-center gap-2 text-sm text-gray-300 mb-3">
        <input type="checkbox" checked={feesAllowed} onChange={(e) => setFeesAllowed(e.target.checked)} />
        Referral fees allowed in this category
      </label>
      {turningFeesOn && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-lg px-3 py-2.5 text-xs text-red-300 mb-3">
          Referral fees in this category are restricted by law or professional rules. Confirm with counsel before enabling.
          <label className="flex items-center gap-2 mt-2 text-red-200">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I've confirmed with counsel that this is allowed.
          </label>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-gray-300 mb-3">
        <input type="checkbox" checked={requiresDisclosure} onChange={(e) => setRequiresDisclosure(e.target.checked)} />
        Always show disclosure (even with no fee configured)
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-300 mb-3">
        <input type="checkbox" checked={creditAllowed} onChange={(e) => setCreditAllowed(e.target.checked)} />
        Senior credit allowed in this category
      </label>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">Disclosure Text</label>
      <textarea className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-950 text-sm text-white mb-3" rows={2} value={disclosureText} onChange={(e) => setDisclosureText(e.target.value)} />
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="h-9 px-4 rounded-lg bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 disabled:opacity-50">
          {saving ? "Saving…" : "Save Referral Policy"}
        </button>
        {msg && <span className="text-xs text-gray-500">{msg}</span>}
      </div>
    </section>
  );
}

// Read-only: the partner matching criteria are generated from the client
// matching questions in code (lib/partners/questions.ts), so this shows
// exactly what partners and clients are asked, side by side.
function MatchingCriteriaPreview({ category }: { category: MarketplaceCategory }) {
  const criteria = getPartnerCriteria(category.label as PartnerCategory);
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-white mb-1">Matching Criteria</h2>
      <p className="text-xs text-gray-500 mb-4">
        Built automatically from the client matching questions. When a client question or option changes, partners and this page update with it.
      </p>
      {criteria.length === 0 ? (
        <p className="text-sm text-gray-500">This category has no guided client questions, so there are no matching criteria.</p>
      ) : (
        <div className="space-y-4">
          {criteria.map((c) => (
            <div key={c.questionId}>
              <p className="text-sm text-gray-200">{c.prompt}</p>
              <p className="text-[11px] text-gray-500 mb-1.5">Clients see: {c.clientPrompt}</p>
              <div className="flex flex-wrap gap-1.5">
                {c.options.map((o) => (
                  <span key={o.value} className="px-2 py-0.5 rounded-full text-[11px] bg-gray-800 border border-gray-700 text-gray-300">{o.label}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
