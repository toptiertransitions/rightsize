"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { BrandContactView, TopTierVisibility } from "@/lib/brands/shared";
import type { ChecklistItem } from "@/lib/checklists/shared";
import type { ClientLocation, PartnerProfile } from "@/lib/partners/types";

// Shared state for the Tenant Config live preview. The brand form, the
// preferred partners editor and the checklist editor each write here as
// they change, and the phone preview reads it, so every edit shows up on
// the preview immediately (before or after saving).

export interface BrandPreviewState {
  displayName: string;
  subtitle: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  welcomeMessage: string;
  welcomeSenderName: string;
  welcomeSenderTitle: string;
  topTierVisibility: TopTierVisibility;
  contacts: BrandContactView[];
}

/** What changed last, so the preview can jump to that screen. */
export type PreviewChange =
  | { kind: "checklist"; at: number }
  | { kind: "preferred"; at: number; partnerId: string; added: boolean };

interface Ctx {
  brand: BrandPreviewState;
  setBrand: (b: BrandPreviewState) => void;
  checklistItems: ChecklistItem[];
  setChecklistItems: (items: ChecklistItem[]) => void;
  preferredIds: string[];
  setPreferredIds: (ids: string[], changed?: { partnerId: string; added: boolean }) => void;
  lastChange: PreviewChange | null;
  /** Live marketplace directory (what clients can be matched with) */
  directory: PartnerProfile[];
  /** Where the sample resident lives, by default the community's own zip */
  defaultLocation: ClientLocation & { city?: string };
  /** The community's own marketplace partner id (never shown as a match) */
  communityPartnerId: string;
}

const TenantPreviewContext = createContext<Ctx | null>(null);

export function TenantPreviewProvider({
  initialBrand,
  initialChecklistItems,
  initialPreferredIds,
  directory,
  defaultLocation,
  communityPartnerId,
  children,
}: {
  initialBrand: BrandPreviewState;
  initialChecklistItems: ChecklistItem[];
  initialPreferredIds: string[];
  directory: PartnerProfile[];
  defaultLocation: ClientLocation & { city?: string };
  communityPartnerId: string;
  children: React.ReactNode;
}) {
  const [brand, setBrand] = useState(initialBrand);
  const [checklistItems, setItems] = useState(initialChecklistItems);
  const [preferredIds, setIds] = useState(initialPreferredIds);
  const [lastChange, setLastChange] = useState<PreviewChange | null>(null);

  const value = useMemo<Ctx>(() => ({
    brand,
    setBrand,
    checklistItems,
    setChecklistItems: (items) => { setItems(items); setLastChange({ kind: "checklist", at: Date.now() }); },
    preferredIds,
    setPreferredIds: (ids, changed) => {
      setIds(ids);
      if (changed) setLastChange({ kind: "preferred", at: Date.now(), ...changed });
    },
    lastChange,
    directory,
    defaultLocation,
    communityPartnerId,
  }), [brand, checklistItems, preferredIds, lastChange, directory, defaultLocation, communityPartnerId]);

  return <TenantPreviewContext.Provider value={value}>{children}</TenantPreviewContext.Provider>;
}

export function useTenantPreview(): Ctx | null {
  return useContext(TenantPreviewContext);
}
