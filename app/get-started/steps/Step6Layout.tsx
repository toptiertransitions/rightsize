"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { NumberStepper, Chip } from "@/components/onboarding/shared";
import type { WizardData } from "../wizardTypes";

interface Props {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
}

export function Step6Layout({ data, update }: Props) {
  const [addingSpace, setAddingSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");

  function toggleSpace(key: string) {
    update({ spaces: data.spaces.map(s => s.key === key ? { ...s, on: !s.on } : s) });
  }

  function addCustomSpace() {
    const name = newSpaceName.trim();
    if (!name) return;
    const key = `custom_${Date.now()}`;
    update({ spaces: [...data.spaces, { key, name, on: true, custom: true }] });
    setNewSpaceName("");
    setAddingSpace(false);
  }

  return (
    <div className="space-y-7">
      <h2 className="text-xl font-bold text-gray-900 leading-snug">
        For planning and cataloging, your layout will be helpful.
      </h2>

      <div className="divide-y divide-gray-100">
        <NumberStepper label="Bedrooms" value={data.bedrooms} onChange={v => update({ bedrooms: v })} min={0} />
        <NumberStepper label="Bathrooms" value={data.bathrooms} onChange={v => update({ bathrooms: v })} min={0} step={0.5} format={v => v.toString()} />
      </div>

      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-3">Which of these spaces do you have?</h3>
        <div className="flex flex-wrap gap-2">
          {data.spaces.map(s => (
            <Chip key={s.key} label={s.name} selected={s.on} onClick={() => toggleSpace(s.key)} />
          ))}
          {!addingSpace ? (
            <button
              type="button"
              onClick={() => setAddingSpace(true)}
              className="min-h-[48px] px-4 rounded-full border border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-forest-400 hover:text-forest-700 transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add another space
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                autoFocus
                value={newSpaceName}
                onChange={e => setNewSpaceName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomSpace(); } }}
                placeholder="Space name"
                className="h-12 px-4 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
              />
              <button type="button" onClick={addCustomSpace} className="h-12 px-4 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700">
                Add
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function step6Valid(): boolean {
  return true;
}
