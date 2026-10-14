"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import type { ChecklistDueType, ChecklistItem } from "@/lib/checklists/shared";
import { ChecklistEditor } from "./ChecklistEditor";

type Result = { ok: true; items: ChecklistItem[] } | { ok: false; error: string };

// Partner portal, before a community has any checklist tasks. The account
// owner gets a simple start; everyone else is told the owner sets it up.
export function ChecklistGetStarted({
  communityName,
  isOwner,
  onSave,
  onRemove,
  onReorder,
}: {
  communityName: string;
  isOwner: boolean;
  onSave: (input: { id?: string; title: string; details: string; dueType: ChecklistDueType; dueDays?: number; dueDate?: string }) => Promise<Result>;
  onRemove: (itemId: string) => Promise<Result>;
  onReorder: (ids: string[]) => Promise<Result>;
}) {
  const router = useRouter();
  const [building, setBuilding] = useState(false);

  if (building) {
    return (
      <ChecklistEditor
        theme="light"
        communityName={communityName}
        initialItems={[]}
        onSave={onSave}
        onRemove={onRemove}
        onReorder={onReorder}
        onDone={() => router.refresh()}
      />
    );
  }

  return (
    <div className="rounded-2xl border border-cream-200 bg-white shadow-sm px-6 py-10 text-center">
      <span className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-forest-50 text-forest-700 flex items-center justify-center">
        <ClipboardCheck className="w-6 h-6" />
      </span>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Build your resident checklist</h2>
      <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
        {isOwner
          ? `List what every new resident needs to do before and after moving into ${communityName}, like signing the residency agreement or scheduling a walkthrough. Residents see it on their Plan page, and you can track everyone's progress here.`
          : `Once your account owner sets up ${communityName}'s checklist, you'll track each resident's progress here.`}
      </p>
      {isOwner && (
        <button
          type="button"
          onClick={() => setBuilding(true)}
          className="mt-6 inline-flex items-center justify-center h-11 px-6 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700"
        >
          Create checklist
        </button>
      )}
    </div>
  );
}
