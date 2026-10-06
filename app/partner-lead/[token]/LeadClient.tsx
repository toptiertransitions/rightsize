"use client";

import { useState } from "react";
import type { MarketplaceIntroductionStatus } from "@/lib/marketplace/types";
import { updateLeadStatusAction } from "../actions";

interface Props {
  token: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  categoryAnswers: Record<string, string | string[]>;
  status: MarketplaceIntroductionStatus;
}

const ACTIONS: { status: MarketplaceIntroductionStatus; label: string }[] = [
  { status: "Contacted", label: "Mark Contacted" },
  { status: "Engaged", label: "Mark Engaged" },
  { status: "Declined", label: "Decline" },
];

export function LeadClient({ token, clientName, clientEmail, clientPhone, categoryAnswers, status }: Props) {
  const [currentStatus, setCurrentStatus] = useState(status);
  const [saving, setSaving] = useState<MarketplaceIntroductionStatus | null>(null);
  const [error, setError] = useState("");

  async function setStatus(newStatus: MarketplaceIntroductionStatus) {
    setSaving(newStatus);
    setError("");
    const result = await updateLeadStatusAction(token, newStatus);
    setSaving(null);
    if (!result.ok) { setError(result.error); return; }
    setCurrentStatus(newStatus);
  }

  const answerRows = Object.entries(categoryAnswers).filter(([, v]) => v && (!Array.isArray(v) || v.length > 0));

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6 py-10">
      <div className="max-w-md w-full">
        <h1 className="text-xl font-bold text-gray-900 mb-1">New Client Introduction</h1>
        <p className="text-sm text-gray-500 mb-6">From Top Tier Transitions</p>

        <div className="rounded-2xl border border-gray-100 p-5 mb-6 space-y-2">
          <p className="text-sm text-gray-900 font-medium">{clientName}</p>
          {clientEmail && <p className="text-sm text-gray-500">{clientEmail}</p>}
          {clientPhone && <p className="text-sm text-gray-500">{clientPhone}</p>}
        </div>

        {answerRows.length > 0 && (
          <div className="rounded-2xl border border-gray-100 p-5 mb-6 space-y-2">
            {answerRows.map(([key, value]) => (
              <div key={key} className="flex justify-between text-sm gap-4">
                <span className="text-gray-400">{key}</span>
                <span className="text-gray-700 text-right">{Array.isArray(value) ? value.join(", ") : value}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <button
              key={a.status}
              onClick={() => setStatus(a.status)}
              disabled={saving !== null || currentStatus === a.status}
              className={`h-10 px-4 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
                currentStatus === a.status ? "bg-forest-600 text-white" : "border border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {saving === a.status ? "Saving…" : currentStatus === a.status ? `${a.label.replace("Mark ", "")} ✓` : a.label}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>
    </div>
  );
}
