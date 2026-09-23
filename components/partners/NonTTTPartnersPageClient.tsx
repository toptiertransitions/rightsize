"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PARTNER_CATEGORIES, type PartnerCategory } from "@/lib/types";
import type { MatchResult, PartnerProfile } from "@/lib/partners/types";
import { selectPartnerAction, deselectPartnerAction, activateServiceInterestAction, deactivateServiceInterestAction } from "@/app/(protected)/partners/actions";
import { nonTTTCategoryLabel } from "@/lib/partners/nonTTTCategories";
import { SelectedPartnersTray } from "./SelectedPartnersTray";
import { CategorySection } from "./CategorySection";
import { GreyedCategoryCard } from "./GreyedCategoryCard";
import { TTTMoveManagerCard } from "./TTTMoveManagerCard";
import { PartnerDetailModal } from "./PartnerDetailModal";

interface Props {
  tenantId: string;
  tenantName: string;
  initialActiveCategories: PartnerCategory[];
  initialGreyedCategories: PartnerCategory[];
  matchesByCategory: Record<PartnerCategory, MatchResult[]>;
  initialSelections: Partial<Record<PartnerCategory, string>>;
  partnersById: Record<string, PartnerProfile>;
  canEdit: boolean;
  appOnlyIntent: boolean;
}

export function NonTTTPartnersPageClient({
  tenantId, tenantName, initialActiveCategories, initialGreyedCategories, matchesByCategory,
  initialSelections, partnersById, canEdit, appOnlyIntent,
}: Props) {
  const [activeCategories, setActiveCategories] = useState(initialActiveCategories);
  const [greyedCategories, setGreyedCategories] = useState(initialGreyedCategories);
  const [selections, setSelections] = useState(initialSelections);
  const [pendingCategory, setPendingCategory] = useState<PartnerCategory | null>(null);
  const [pendingToggle, setPendingToggle] = useState<PartnerCategory | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [detailPartnerId, setDetailPartnerId] = useState<string | null>(null);

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

  const handleSelect = useCallback(async (category: PartnerCategory, partnerId: string) => {
    const prev = selections[category];
    setSelections((s) => ({ ...s, [category]: partnerId }));
    setPendingCategory(category);
    const result = await selectPartnerAction(tenantId, category, partnerId);
    setPendingCategory(null);
    if (!result.ok) {
      setSelections((s) => ({ ...s, [category]: prev }));
      setToast(result.error);
    }
  }, [selections, tenantId]);

  const handleDeselect = useCallback(async (category: PartnerCategory) => {
    const prev = selections[category];
    setSelections((s) => {
      const next = { ...s };
      delete next[category];
      return next;
    });
    setPendingCategory(category);
    const result = await deselectPartnerAction(tenantId, category);
    setPendingCategory(null);
    if (!result.ok) {
      setSelections((s) => ({ ...s, [category]: prev }));
      setToast(result.error);
    }
  }, [selections, tenantId]);

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

  const selectedPartners: Partial<Record<PartnerCategory, PartnerProfile>> = {};
  for (const cat of PARTNER_CATEGORIES) {
    const id = selections[cat];
    if (id && partnersById[id]) selectedPartners[cat] = partnersById[id];
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-[calc(env(safe-area-inset-bottom,0px)+40px)] pt-[max(20px,env(safe-area-inset-top))]">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Your Partners</h1>
        <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
          {appOnlyIntent && activeCategories.length === 0
            ? "You told us you just want to use the app to simplify your move. If you change your mind on any of these, just say so below."
            : "We’ve matched you with our most trusted partners. Choose one in each category to build your team."}
        </p>
      </header>

      <SelectedPartnersTray
        categories={PARTNER_CATEGORIES}
        selectedPartners={selectedPartners}
        onEmptyClick={scrollToCategory}
        onChangeClick={scrollToCategory}
      />

      <div className="mt-8 space-y-6">
        {activeCategories.map((category) => (
          <div key={category} className="motion-safe:animate-[fadeInScale_0.3s_ease-out]">
            {category === "Move Manager" ? (
              <TTTMoveManagerCard tenantName={tenantName} />
            ) : (
              <CategorySection
                category={category}
                label={nonTTTCategoryLabel(category)}
                matches={matchesByCategory[category] ?? []}
                selectedPartnerId={selections[category]}
                canEdit={canEdit}
                pending={pendingCategory === category}
                onSelect={(partnerId) => handleSelect(category, partnerId)}
                onDeselect={() => handleDeselect(category)}
                onLearnMore={(partnerId) => setDetailPartnerId(partnerId)}
                sectionRef={(el) => { if (el) sectionRefs.current[category] = el; }}
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

      {detailPartnerId && partnersById[detailPartnerId] && (
        <PartnerDetailModal partner={partnersById[detailPartnerId]} onClose={() => setDetailPartnerId(null)} />
      )}

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom,0px)+20px)] z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg max-w-[90vw]">
          {toast}
        </div>
      )}
    </div>
  );
}
