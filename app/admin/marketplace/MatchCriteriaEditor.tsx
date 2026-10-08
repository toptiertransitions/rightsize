"use client";

import type { PartnerCategory } from "@/lib/types";
import {
  getPartnerCriteria,
  readMatchCriteria,
  currentCriteriaValues,
  MATCH_CRITERIA_ATTR,
} from "@/lib/partners/criteria";

// Admin view of a listing's matching criteria. The questions and options
// come straight from the client matching questions, so they stay in sync
// automatically when those change.
export function MatchCriteriaEditor({
  category,
  attributes,
  onChange,
}: {
  category: PartnerCategory;
  attributes: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const criteriaDefs = getPartnerCriteria(category);
  if (criteriaDefs.length === 0) return null;
  const criteria = readMatchCriteria(attributes);
  const answered = criteriaDefs.filter((c) => currentCriteriaValues(c, criteria).length > 0).length;

  function toggle(questionId: string, value: string) {
    const current = criteria[questionId] ?? [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onChange({ ...attributes, [MATCH_CRITERIA_ATTR]: { ...criteria, [questionId]: next } });
  }

  function setAll(questionId: string, values: string[]) {
    onChange({ ...attributes, [MATCH_CRITERIA_ATTR]: { ...criteria, [questionId]: values } });
  }

  return (
    <div className="mb-5 pb-5 border-b border-gray-800">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Matching criteria</p>
        <span className={`text-xs ${answered === criteriaDefs.length ? "text-green-400" : "text-amber-400"}`}>
          {answered} of {criteriaDefs.length} set
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        What this partner serves, using the same options clients answer. Matches are ranked on these.
      </p>
      <div className="space-y-4">
        {criteriaDefs.map((c) => {
          const selected = currentCriteriaValues(c, criteria);
          const allOn = selected.length === c.options.length;
          return (
            <div key={c.questionId}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm text-gray-200">{c.prompt}</p>
                <button
                  type="button"
                  onClick={() => setAll(c.questionId, allOn ? [] : c.options.map((o) => o.value))}
                  className="text-[11px] text-gray-500 hover:text-gray-300 whitespace-nowrap"
                >
                  {allOn ? "Clear" : "Select all"}
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mb-2">Clients see: {c.clientPrompt}</p>
              <div className="flex flex-wrap gap-1.5">
                {c.options.map((o) => {
                  const on = selected.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => toggle(c.questionId, o.value)}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                        on
                          ? "bg-forest-600 border-forest-500 text-white"
                          : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
