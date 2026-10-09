"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Shown to an admin while "View as" previews a community brand.
export function BrandPreviewBanner({ name }: { name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function exit() {
    setBusy(true);
    await fetch("/api/admin/brands/preview", { method: "DELETE" }).catch(() => {});
    router.refresh();
    setBusy(false);
  }
  return (
    <div className="sticky top-0 z-[60] bg-amber-500 text-white px-4 py-2 flex items-center justify-between gap-3 text-sm font-medium" style={{ paddingTop: "max(0.5rem, var(--sat))" }}>
      <span className="truncate">Previewing as {name}</span>
      <button onClick={exit} disabled={busy} className="underline hover:no-underline whitespace-nowrap disabled:opacity-60">
        {busy ? "Exiting…" : "Exit preview"}
      </button>
    </div>
  );
}
