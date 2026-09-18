"use client";

import { useState } from "react";
import type { PlanEntry } from "@/lib/types";
import { PartnerKeyDateModal } from "./PartnerKeyDateModal";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

interface Props {
  tenantId: string;
  tenantName: string;
  initialKeyDates: PlanEntry[];
  currentUserId: string;
  isArchived?: boolean;
}

export function PartnerKeyDatesSection({ tenantId, tenantName, initialKeyDates, currentUserId, isArchived }: Props) {
  const [keyDates, setKeyDates] = useState(initialKeyDates);
  const [modalState, setModalState] = useState<{ mode: "add" | "edit"; entry?: PlanEntry } | null>(null);

  const sorted = [...keyDates].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-gray-900">Key Dates</h2>
        {!isArchived && (
          <button
            onClick={() => setModalState({ mode: "add" })}
            className="px-3 h-8 text-xs font-medium rounded-lg bg-[#2d4a3e] text-white hover:bg-[#243d33] transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Key Date
          </button>
        )}
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-gray-400">No key dates yet.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((e) => {
            const isOwn = e.createdByUserId === currentUserId;
            const Tag = isOwn ? "button" : "div";
            return (
              <Tag
                key={e.id}
                type={isOwn ? "button" : undefined}
                onClick={isOwn ? () => setModalState({ mode: "edit", entry: e }) : undefined}
                className={`text-left bg-[#2d4a3e]/5 border border-[#2d4a3e]/10 rounded-xl px-4 py-3 ${
                  isOwn ? "hover:border-[#2d4a3e]/40 cursor-pointer transition-colors" : ""
                }`}
              >
                <p className="text-xs font-medium text-[#2d4a3e]">{e.activity}</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{formatDate(e.date)}</p>
              </Tag>
            );
          })}
        </div>
      )}

      {modalState && (
        <PartnerKeyDateModal
          projects={[{ tenantId, name: tenantName }]}
          defaultTenantId={tenantId}
          entry={modalState.entry}
          onClose={() => setModalState(null)}
          onSaved={(saved) => {
            setKeyDates(prev => {
              const exists = prev.some(e => e.id === saved.id);
              return exists ? prev.map(e => (e.id === saved.id ? saved : e)) : [...prev, saved];
            });
            setModalState(null);
          }}
          onDeleted={(id) => {
            setKeyDates(prev => prev.filter(e => e.id !== id));
            setModalState(null);
          }}
        />
      )}
    </section>
  );
}
