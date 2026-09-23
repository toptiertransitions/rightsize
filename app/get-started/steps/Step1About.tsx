"use client";

import type { WizardData } from "../wizardTypes";

interface Props {
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
}

export function Step1About({ data, update }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">What&apos;s your name?</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className="block text-xs font-medium text-gray-500 mb-1.5">First name</label>
            <input
              id="firstName"
              type="text"
              autoFocus
              value={data.firstName}
              onChange={e => update({ firstName: e.target.value })}
              placeholder="Jane"
              className="w-full h-12 px-4 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
            />
          </div>
          <div>
            <label htmlFor="lastName" className="block text-xs font-medium text-gray-500 mb-1.5">Last name</label>
            <input
              id="lastName"
              type="text"
              value={data.lastName}
              onChange={e => update({ lastName: e.target.value })}
              placeholder="Smith"
              className="w-full h-12 px-4 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
            />
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">What&apos;s your current zip code?</h2>
        <p className="text-sm text-gray-500 mb-4">Helps us match you with people near you.</p>
        <input
          id="currentZip"
          type="text"
          inputMode="numeric"
          maxLength={5}
          value={data.currentZip}
          onChange={e => update({ currentZip: e.target.value.replace(/\D/g, "").slice(0, 5) })}
          placeholder="60601"
          className="w-full max-w-[180px] h-12 px-4 rounded-xl border border-gray-300 text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
        />
      </div>
    </div>
  );
}

export function step1Valid(data: WizardData): boolean {
  return data.firstName.trim().length > 0 && data.lastName.trim().length > 0 && /^\d{5}$/.test(data.currentZip);
}
