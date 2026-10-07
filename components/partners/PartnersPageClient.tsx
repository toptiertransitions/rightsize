"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PARTNER_CATEGORIES, type PartnerCategory } from "@/lib/types";
import type { MatchResult, PartnerProfile } from "@/lib/partners/types";
import { selectPartnerAction, deselectPartnerAction, removeReferralPartnerAction } from "@/app/(protected)/partners/actions";
import { SelectedPartnersTray } from "./SelectedPartnersTray";
import { CategoryChipBar } from "./CategoryChipBar";
import { CategorySection } from "./CategorySection";
import { PartnerDetailModal } from "./PartnerDetailModal";
import { DocumentsSection } from "./DocumentsSection";

interface Props {
  tenantId: string;
  matchesByCategory: Record<PartnerCategory, MatchResult[]>;
  initialSelections: Partial<Record<PartnerCategory, string>>;
  partnersById: Record<string, PartnerProfile>;
  canEdit: boolean;
  isStaffPreview: boolean;
  clientLabel?: string;
  lockedCategories: PartnerCategory[];
  canRemoveReferral: boolean;
}

export function PartnersPageClient({ tenantId, matchesByCategory, initialSelections, partnersById, canEdit, isStaffPreview, clientLabel, lockedCategories: initialLocked, canRemoveReferral }: Props) {
  const router = useRouter();
  const [selections, setSelections] = useState(initialSelections);
  const [lockedCategories, setLockedCategories] = useState(initialLocked);
  const [removingReferral, setRemovingReferral] = useState<PartnerCategory | null>(null);
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

  // TTTAdmin only. Clears the lock locally, then refreshes so the server
  // recomputes this category's marketplace matches.
  const handleRemoveReferral = useCallback(async (category: PartnerCategory) => {
    setRemovingReferral(category);
    const result = await removeReferralPartnerAction(tenantId, category);
    setRemovingReferral(null);
    if (!result.ok) {
      setToast(result.error);
      return;
    }
    setLockedCategories((l) => l.filter((c) => c !== category));
    setSelections((s) => {
      const next = { ...s };
      delete next[category];
      return next;
    });
    setToast(`Referral partner removed — the marketplace is open for ${category}.`);
    router.refresh();
  }, [tenantId, router]);

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

      <header className="mb-1">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Your Partners</h1>
      </header>
      <p className="text-sm text-gray-500 mb-5 leading-relaxed">
        Track who&rsquo;s on your team below, and browse our vetted network to choose one in each category.
      </p>

      <SelectedPartnersTray
        categories={PARTNER_CATEGORIES}
        selectedPartners={selectedPartners}
        onEmptyClick={scrollToCategory}
        onChangeClick={scrollToCategory}
        filesEnabled
        tenantId={tenantId}
        lockedCategories={lockedCategories}
      />

      <DocumentsSection tenantId={tenantId} canMatch={canEdit || isStaffPreview} selectedPartners={selectedPartners} />

      <div className="flex items-center gap-3 mt-10 mb-1">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 whitespace-nowrap">Vetted Partner Matching</h2>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
      <p className="text-sm text-gray-500 mb-5 leading-relaxed">
        Every partner below has been vetted by Top Tier Transitions. Browse each category and select who you&rsquo;d like on your team.
      </p>

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
            locked={lockedCategories.includes(category)}
            canRemoveReferral={canRemoveReferral}
            removingReferral={removingReferral === category}
            onRemoveReferral={() => handleRemoveReferral(category)}
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
