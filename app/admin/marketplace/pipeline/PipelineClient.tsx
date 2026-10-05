"use client";

import { useState } from "react";
import Link from "next/link";
import type { MarketplacePartner, MarketplaceLifecycleStatus } from "@/lib/marketplace/types";
import { movePartnerLifecycleAction, importProspectsFromCrmAction } from "../actions";

const COLUMNS: MarketplaceLifecycleStatus[] = ["Prospect", "Invited", "Submitted", "Live", "Paused"];

interface Card {
  partner: MarketplacePartner;
  categoryLabels: string[];
}

export function PipelineClient({ cards: initialCards, categories }: { cards: Card[]; categories: { id: string; label: string }[] }) {
  const [cards, setCards] = useState(initialCards);
  const [dragging, setDragging] = useState<string | null>(null);
  const [blockMsg, setBlockMsg] = useState<{ partnerId: string; error: string } | null>(null);
  const [importCategory, setImportCategory] = useState(categories[0]?.id ?? "");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  async function drop(partnerId: string, newStatus: MarketplaceLifecycleStatus) {
    setDragging(null);
    setBlockMsg(null);
    const card = cards.find((c) => c.partner.id === partnerId);
    if (!card || card.partner.lifecycleStatus === newStatus) return;

    const result = await movePartnerLifecycleAction(partnerId, newStatus);
    if (!result.ok) { setBlockMsg({ partnerId, error: result.error }); return; }
    setCards((prev) => prev.map((c) => (c.partner.id === partnerId ? { ...c, partner: { ...c.partner, lifecycleStatus: newStatus } } : c)));
  }

  async function runImport() {
    setImporting(true);
    setImportMsg("");
    const result = await importProspectsFromCrmAction(importCategory);
    setImporting(false);
    if (!result.ok) { setImportMsg(result.error); return; }
    setImportMsg(`Created ${result.data?.created ?? 0} new prospects · ${result.data?.skipped ?? 0} already existed.`);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">Pipeline</h1>
        <div className="flex items-center gap-2">
          <select value={importCategory} onChange={(e) => setImportCategory(e.target.value)} className="h-9 px-3 rounded-lg border border-gray-700 bg-gray-900 text-sm text-white">
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <button onClick={runImport} disabled={importing} className="h-9 px-4 rounded-lg border border-gray-600 text-gray-300 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap">
            {importing ? "Importing…" : "Import CRM Prospects"}
          </button>
        </div>
      </div>
      {importMsg && <p className="text-xs text-gray-500 mb-4">{importMsg}</p>}

      <div className="grid grid-cols-5 gap-3">
        {COLUMNS.map((col) => {
          const colCards = cards.filter((c) => c.partner.lifecycleStatus === col);
          return (
            <div
              key={col}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging) drop(dragging, col);
              }}
              className="bg-gray-900/60 border border-gray-800 rounded-xl p-2 min-h-[400px]"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 px-2 py-1.5">{col} ({colCards.length})</p>
              <div className="space-y-2">
                {colCards.map(({ partner, categoryLabels }) => (
                  <div
                    key={partner.id}
                    draggable
                    onDragStart={() => setDragging(partner.id)}
                    onDragEnd={() => setDragging(null)}
                    className="bg-gray-900 border border-gray-700 rounded-lg p-3 cursor-grab active:cursor-grabbing"
                  >
                    <Link href={`/admin/marketplace/partners/${partner.id}`} className="text-sm text-gray-100 hover:text-forest-400 font-medium">
                      {partner.companyName}
                    </Link>
                    <p className="text-xs text-gray-500 mt-0.5">{categoryLabels.join(", ") || "No listing yet"}</p>
                    {blockMsg?.partnerId === partner.id && (
                      <p className="text-xs text-amber-400 mt-1.5">{blockMsg.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
