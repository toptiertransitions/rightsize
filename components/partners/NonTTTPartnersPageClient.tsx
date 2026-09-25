"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PARTNER_CATEGORIES, type PartnerCategory } from "@/lib/types";
import type { PartnerProfile } from "@/lib/partners/types";
import { activateServiceInterestAction, deactivateServiceInterestAction, requestPartnerIntroAction, selectPartnerAction, deselectPartnerAction } from "@/app/(protected)/partners/actions";
import { nonTTTCategoryLabel } from "@/lib/partners/nonTTTCategories";
import { isPartnerRequestComplete, type PrefillTenant } from "@/lib/partners/questions";
import type { ScoringResult } from "@/lib/partners/scoring";
import { SelectedPartnersTray } from "./SelectedPartnersTray";
import { GreyedCategoryCard } from "./GreyedCategoryCard";
import { TTTMoveManagerCard } from "./TTTMoveManagerCard";
import { PartnerRequestCard } from "./PartnerRequestCard";
import { PartnerRequestFlow } from "./PartnerRequestFlow";

interface Props {
  tenantId: string;
  tenantName: string;
  initialActiveCategories: PartnerCategory[];
  initialGreyedCategories: PartnerCategory[];
  initialSelections: Partial<Record<PartnerCategory, string>>;
  partnersById: Record<string, PartnerProfile>;
  canEdit: boolean;
  appOnlyIntent: boolean;
  initialRequestAnswers: Partial<Record<PartnerCategory, Record<string, string | string[]>>>;
  initialIntroRequests: Partial<Record<PartnerCategory, { partnerId: string; requestedAt: string }[]>>;
  initialMatches: Partial<Record<PartnerCategory, ScoringResult>>;
  prefillTenant: PrefillTenant;
}

export function NonTTTPartnersPageClient({
  tenantId, tenantName, initialActiveCategories, initialGreyedCategories,
  initialSelections, partnersById, canEdit, appOnlyIntent, initialRequestAnswers,
  initialIntroRequests, initialMatches, prefillTenant,
}: Props) {
  const router = useRouter();
  const [activeCategories, setActiveCategories] = useState(initialActiveCategories);
  const [greyedCategories, setGreyedCategories] = useState(initialGreyedCategories);
  const [selections, setSelections] = useState(initialSelections);
  const [pendingToggle, setPendingToggle] = useState<PartnerCategory | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [requestAnswers, setRequestAnswers] = useState(initialRequestAnswers);
  const [flowCategory, setFlowCategory] = useState<PartnerCategory | null>(null);
  const [introRequests, setIntroRequests] = useState(initialIntroRequests);
  const [pendingRequest, setPendingRequest] = useState<{ category: PartnerCategory; partnerId: string } | null>(null);
  const [pendingSelect, setPendingSelect] = useState<PartnerCategory | null>(null);

  const sectionRefs = useRef<Partial<Record<PartnerCategory, HTMLElement>>>({});

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const scrollToCategory = useCallback((category: PartnerCategory) => {
    const el = sectionRefs.current[category];
    if (!el) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "start" });
  }, []);

  const handleActivate = useCallback(async (category: PartnerCategory) => {
    setPendingToggle(category);
    const result = await activateServiceInterestAction(tenantId, category);
    setPendingToggle(null);
    if (!result.ok) {
      setToast(result.error);
      return;
    }
    setGreyedCategories((g) => g.filter((c) => c !== category));
    setActiveCategories((a) => (a.includes(category) ? a : [...a, category]));
  }, [tenantId]);

  const handleDeactivate = useCallback(async (category: PartnerCategory) => {
    setPendingToggle(category);
    const result = await deactivateServiceInterestAction(tenantId, category);
    setPendingToggle(null);
    if (!result.ok) {
      setToast(result.error);
      return;
    }
    setActiveCategories((a) => a.filter((c) => c !== category));
    setGreyedCategories((g) => (g.includes(category) ? g : [...g, category]));
  }, [tenantId]);

  const handleRequestIntro = useCallback(async (category: PartnerCategory, partnerId: string) => {
    setPendingRequest({ category, partnerId });
    const result = await requestPartnerIntroAction(tenantId, category, partnerId);
    setPendingRequest(null);
    if (!result.ok) {
      setToast(result.error);
      return;
    }
    setIntroRequests((prev) => {
      const existing = prev[category] ?? [];
      if (existing.some((r) => r.partnerId === partnerId)) return prev;
      return { ...prev, [category]: [...existing, { partnerId, requestedAt: new Date().toISOString() }] };
    });
    setToast("Intro requested — we'll let you know when they reach out.");
  }, [tenantId]);

  // Requesting an intro is just inquiring — up to 2 per category are
  // allowed, so it can't double as "this is who I'm going with." This is
  // the separate, explicit action that actually puts a partner on "Your
  // Team," same mechanism (and same PartnerSelections data) the TTT-managed
  // marketplace flow already uses.
  const handleSelect = useCallback(async (category: PartnerCategory, partnerId: string) => {
    const prev = selections[category];
    setSelections((s) => ({ ...s, [category]: partnerId }));
    setPendingSelect(category);
    const result = await selectPartnerAction(tenantId, category, partnerId);
    setPendingSelect(null);
    if (!result.ok) {
      setSelections((s) => ({ ...s, [category]: prev }));
      setToast(result.error);
      return;
    }
    setToast("Added to your team.");
  }, [selections, tenantId]);

  const handleDeselect = useCallback(async (category: PartnerCategory) => {
    const prev = selections[category];
    setSelections((s) => {
      const next = { ...s };
      delete next[category];
      return next;
    });
    setPendingSelect(category);
    const result = await deselectPartnerAction(tenantId, category);
    setPendingSelect(null);
    if (!result.ok) {
      setSelections((s) => ({ ...s, [category]: prev }));
      setToast(result.error);
    }
  }, [selections, tenantId]);

  const selectedPartners: Partial<Record<PartnerCategory, PartnerProfile>> = {};
  for (const cat of PARTNER_CATEGORIES) {
    const id = selections[cat];
    if (id && partnersById[id]) selectedPartners[cat] = partnersById[id];
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-[calc(env(safe-area-inset-bottom,0px)+40px)] pt-[max(20px,env(safe-area-inset-top))]">
      <header className="mb-1">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Your Partners</h1>
      </header>
      <p className="text-sm text-gray-500 mb-5 leading-relaxed">
        {appOnlyIntent && activeCategories.length === 0
          ? "You told us you just want to use the app to simplify your move. If you change your mind on any of these, just say so below."
          : "Track who’s on your team below, and answer a few quick questions to get matched in each category."}
      </p>

      <SelectedPartnersTray
        categories={PARTNER_CATEGORIES}
        selectedPartners={selectedPartners}
        onEmptyClick={scrollToCategory}
        onChangeClick={scrollToCategory}
      />

      {(activeCategories.length > 0 || greyedCategories.length > 0) && (
        <div className="flex items-center gap-3 mt-10 mb-1">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 whitespace-nowrap">Vetted Partner Matching</h2>
          <div className="h-px flex-1 bg-gray-200" />
        </div>
      )}

      <div className="mt-4 space-y-6">
        {activeCategories.map((category) => (
          <div key={category} className="motion-safe:animate-[fadeInScale_0.3s_ease-out]">
            {category === "Move Manager" ? (
              <TTTMoveManagerCard tenantName={tenantName} />
            ) : (
              <PartnerRequestCard
                category={category}
                answers={requestAnswers[category] ?? {}}
                onOpenFlow={() => setFlowCategory(category)}
                sectionRef={(el) => { if (el) sectionRefs.current[category] = el; }}
                canEdit={canEdit}
                matchResult={initialMatches[category]}
                requestedPartnerIds={(introRequests[category] ?? []).map((r) => r.partnerId)}
                pendingPartnerId={pendingRequest?.category === category ? pendingRequest.partnerId : null}
                onRequestIntro={(partnerId) => handleRequestIntro(category, partnerId)}
                selectedPartnerId={selections[category]}
                pendingSelect={pendingSelect === category}
                onSelect={(partnerId) => handleSelect(category, partnerId)}
                onDeselect={() => handleDeselect(category)}
              />
            )}
            {!selections[category] && (
              <button
                type="button"
                onClick={() => handleDeactivate(category)}
                disabled={pendingToggle === category}
                className="mt-2.5 text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 disabled:opacity-50"
              >
                Not needed
              </button>
            )}
          </div>
        ))}

        {greyedCategories.length > 0 && (
          <div className="pt-2 space-y-4">
            {activeCategories.length > 0 && (
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Not selected</p>
            )}
            {greyedCategories.map((category) => (
              <GreyedCategoryCard
                key={category}
                category={category}
                label={nonTTTCategoryLabel(category)}
                onActivate={() => handleActivate(category)}
                pending={pendingToggle === category}
              />
            ))}
          </div>
        )}
      </div>

      {flowCategory && canEdit && (
        <PartnerRequestFlow
          tenantId={tenantId}
          category={flowCategory}
          initialAnswers={requestAnswers[flowCategory] ?? {}}
          prefillTenant={prefillTenant}
          onClose={() => setFlowCategory(null)}
          onSaved={(patch) =>
            setRequestAnswers((a) => {
              const mergedForCategory = { ...(a[flowCategory] ?? {}), ...patch };
              // Re-fetch server-computed matches the moment this category's
              // questions are all answered — initialMatches is a static
              // server prop, so without this the "finding your matches" card
              // would otherwise sit there until an unrelated page reload.
              if (isPartnerRequestComplete(flowCategory, mergedForCategory)) router.refresh();
              return { ...a, [flowCategory]: mergedForCategory };
            })
          }
        />
      )}

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom,0px)+20px)] z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg max-w-[90vw]">
          {toast}
        </div>
      )}
    </div>
  );
}
