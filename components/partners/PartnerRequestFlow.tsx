"use client";

import { useEffect, useMemo, useState } from "react";
import type { PartnerCategory } from "@/lib/types";
import { getVisibleQuestions, getPrefillAnswers, type PrefillTenant } from "@/lib/partners/questions";
import { nonTTTCategoryLabel } from "@/lib/partners/nonTTTCategories";
import { savePartnerRequestAnswersAction } from "@/app/(protected)/partners/actions";
import { ProgressBar, BackLink, SkipLink, ChoiceCard, Chip, BottomCTA } from "@/components/onboarding/shared";

interface Props {
  tenantId: string;
  category: PartnerCategory;
  initialAnswers: Record<string, string | string[]>;
  prefillTenant: PrefillTenant;
  onClose: () => void;
  onSaved: (patch: Record<string, string | string[]>) => void;
}

export function PartnerRequestFlow({ tenantId, category, initialAnswers, prefillTenant, onClose, onSaved }: Props) {
  const questions = useMemo(() => getVisibleQuestions(category, prefillTenant), [category, prefillTenant]);
  const prefill = useMemo(() => getPrefillAnswers(category, prefillTenant), [category, prefillTenant]);

  const [answers, setAnswers] = useState<Record<string, string | string[]>>({ ...prefill, ...initialAnswers });
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Persist any auto-answered (skipIfPrefilled) values the first time this
  // category's flow is opened, so they're saved even though the user never
  // sees or clicks through a step for them.
  useEffect(() => {
    const visibleIds = new Set(questions.map((q) => q.id));
    const toPersist: Record<string, string> = {};
    for (const id of Object.keys(prefill)) {
      if (!visibleIds.has(id) && initialAnswers[id] === undefined && prefill[id]) {
        toPersist[id] = prefill[id];
      }
    }
    if (Object.keys(toPersist).length > 0) {
      savePartnerRequestAnswersAction(tenantId, category, toPersist).then((result) => {
        if (result.ok) onSaved(toPersist);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, tenantId]);

  const question = questions[step];
  const value = question ? answers[question.id] : undefined;
  const hasValue = Array.isArray(value) ? value.length > 0 : !!value;
  const canContinue = question ? (question.optional || hasValue) : false;
  const isLast = step === questions.length - 1;

  async function persist(patch: Record<string, string | string[]>) {
    setSaving(true);
    setError(null);
    const result = await savePartnerRequestAnswersAction(tenantId, category, patch);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    onSaved(patch);
    return true;
  }

  async function handleContinue() {
    if (!question) return;
    const patch = question.optional && !hasValue ? {} : { [question.id]: value ?? "" };
    if (Object.keys(patch).length > 0) {
      const ok = await persist(patch);
      if (!ok) return;
    }
    if (isLast) {
      onClose();
    } else {
      setStep((s) => s + 1);
    }
  }

  function handleSkip() {
    setAnswers((a) => {
      const next = { ...a };
      delete next[question!.id];
      return next;
    });
    if (isLast) {
      onClose();
    } else {
      setStep((s) => s + 1);
    }
  }

  function setValue(v: string | string[]) {
    setAnswers((a) => ({ ...a, [question!.id]: v }));
  }

  if (!question) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md h-full sm:h-auto sm:max-h-[85vh] sm:rounded-2xl shadow-xl flex flex-col motion-safe:animate-[fadeInScale_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 pt-[max(20px,env(safe-area-inset-top))] sm:pt-5 pb-3 flex items-center gap-3">
          {step > 0 ? <BackLink onClick={() => setStep((s) => s - 1)} /> : <div className="w-11" />}
          <div className="flex-1">
            <ProgressBar step={step + 1} total={questions.length} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          <p className="text-xs font-semibold text-forest-600 uppercase tracking-wide mb-1.5">{nonTTTCategoryLabel(category)}</p>
          <h2 className="text-lg font-bold text-gray-900 leading-snug mb-1">{question.prompt}</h2>
          {question.helper && <p className="text-sm text-gray-500 mb-4">{question.helper}</p>}
          {!question.helper && <div className="mb-4" />}

          {question.type === "single-select" && (
            <div className="flex flex-col gap-2.5">
              {question.options?.map((opt) => (
                <ChoiceCard
                  key={opt.value}
                  title={opt.label}
                  description=""
                  selected={value === opt.value}
                  onClick={() => setValue(opt.value)}
                />
              ))}
            </div>
          )}

          {question.type === "chips-multi" && (
            <div className="flex flex-wrap gap-2">
              {question.options?.map((opt) => {
                const arr = Array.isArray(value) ? value : [];
                const selected = arr.includes(opt.value);
                return (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    selected={selected}
                    onClick={() => setValue(selected ? arr.filter((v) => v !== opt.value) : [...arr, opt.value])}
                  />
                );
              })}
            </div>
          )}

          {question.type === "zip" && (
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={5}
              value={typeof value === "string" ? value : ""}
              onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 5))}
              placeholder="Zip code"
              className="w-full min-h-[48px] px-4 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-forest-500"
            />
          )}

          {question.type === "text" && (
            <textarea
              value={typeof value === "string" ? value : ""}
              onChange={(e) => setValue(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-forest-500 resize-none"
            />
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        <div className="shrink-0 px-5">
          <BottomCTA
            onClick={handleContinue}
            disabled={!canContinue}
            loading={saving}
            label={isLast ? "Finish" : "Continue"}
          >
            {question.optional && !hasValue && (
              <div className="flex justify-center pb-2">
                <SkipLink onClick={handleSkip} />
              </div>
            )}
          </BottomCTA>
        </div>
      </div>
    </div>
  );
}
