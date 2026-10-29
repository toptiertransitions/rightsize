"use client";

import { ChecklistEditor } from "@/components/community-checklist/ChecklistEditor";
import { useTenantPreview } from "./TenantPreviewContext";

// The admin checklist editor, also feeding each saved change to the live
// preview (TenantPreviewContext).
export function LiveChecklistEditor(props: React.ComponentProps<typeof ChecklistEditor>) {
  const setItems = useTenantPreview()?.setChecklistItems;
  const tap = <A extends unknown[]>(fn: (...a: A) => ReturnType<typeof props.onReorder>) => async (...a: A) => {
    const r = await fn(...a);
    if (r.ok) setItems?.(r.items);
    return r;
  };
  return <ChecklistEditor {...props} onSave={tap(props.onSave)} onRemove={tap(props.onRemove)} onReorder={tap(props.onReorder)} />;
}
