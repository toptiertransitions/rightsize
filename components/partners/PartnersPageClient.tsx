"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PARTNER_CATEGORIES, type PartnerCategory } from "@/lib/types";
import type { MatchResult, PartnerProfile } from "@/lib/partners/types";
import { selectPartnerAction, deselectPartnerAction } from "@/app/(protected)/partners/actions";
import { SelectedPartnersTray } from "./SelectedPartnersTray";
import { CategoryChipBar } from "./CategoryChipBar";
import { CategorySection } from "./CategorySection";
import { PartnerDetailModal } from "./PartnerDetailModal";

interface Props {
  tenantId: string;
  matchesByCategory: Record<PartnerCategory, MatchResult[]>;
  initialSelections: Partial<Record<PartnerCategory, string>>;
  partnersById: Record<string, PartnerProfile>;
  canEdit: boolean;
  isStaffPreview: boolean;
  clientLabel?: string;
}

export function PartnersPageClient({ tenantId, matchesByCategory, initialSelections, partnersById, canEdit, isStaffPreview, clientLabel }: Props) {
  const [selections, setSelections] = useState(initialSelections);
  const [pendingCategory, setPendingCategory] = useState<PartnerCategory | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<PartnerCategory>(PARTNER_CATEGORIES[0]);
  const [detailPartnerId, setDetailPartnerId] = useState<string | null>(null);

  const sectionRefs = useRef<Partial<Record<PartnerCategory, HTMLElement>>>({});

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const topMost = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
        const cat = PARTNER_CATEGORIES.find((c) => sectionRefs.current[c] === topMost.target);
        if (cat) setActiveCategory(cat);
      },
      { rootMargin: "-140px 0px -55% 0px", threshold: 0 }
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

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

  const selectedPartners: Partial<Record<PartnerCategory, PartnerProfile>> = {};
  for (const cat of PARTNER_CATEGORIES) {
    const id = selections[cat];
    if (id && partnersById[id]) selectedPartners[cat] = partnersById[id];
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-[calc(env(safe-area-inset-bottom,0px)+40px)] pt-[max(20px,env(safe-area-inset-top))]">
      {isStaffPreview && (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-800">
          Staff preview{clientLabel ? ` — viewing as ${clientLabel}` : ""}. Changes made here save for this project.
        </div>
      )}

      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Your Partners</h1>
        <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
          We&rsquo;ve matched you with our most trusted partners. Choose one in each category to build your team.
        </p>
      </header>

      <SelectedPartnersTray
        categories={PARTNER_CATEGORIES}
        selectedPartners={selectedPartners}
        onEmptyClick={scrollToCategory}
        onChangeClick={scrollToCategory}
        filesEnabled
        onFilesClick={scrollToCategory}
      />

      <CategoryChipBar
        categories={PARTNER_CATEGORIES}
        activeCategory={activeCategory}
        selections={selections}
        onChipClick={scrollToCategory}
      />

      <div className="mt-8 space-y-10">
        {PARTNER_CATEGORIES.map((category) => (
          <CategorySection
            key={category}
            tenantId={tenantId}
            category={category}
            matches={matchesByCategory[category] ?? []}
            selectedPartnerId={selections[category]}
            canEdit={canEdit}
            pending={pendingCategory === category}
            onSelect={(partnerId) => handleSelect(category, partnerId)}
            onDeselect={() => handleDeselect(category)}
            onLearnMore={(partnerId) => setDetailPartnerId(partnerId)}
            sectionRef={(el) => { if (el) sectionRefs.current[category] = el; }}
          />
        ))}
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
