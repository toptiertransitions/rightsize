"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// "View as" at the top of Tenant Config: previews the client app with a
// community's branding (display only, nothing changes for real users).
// Uses the signed rz_brand_preview cookie, honored for Admin/Manager only.
export function ViewAsSwitcher({ brands, current }: { brands: Array<{ id: string; name: string; status: string }>; current: string }) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);

  async function apply(next: string) {
    setValue(next);
    setBusy(true);
    try {
      await fetch("/api/admin/brands/preview", next
        ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: next }) }
        : { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 mb-6">
      <label htmlFor="viewAs" className="text-xs font-medium text-gray-400">View app as</label>
      <select
        id="viewAs"
        value={value}
        disabled={busy}
        onChange={(e) => apply(e.target.value)}
        className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-2 py-1.5"
      >
        <option value="">Top Tier (default)</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>{b.name}{b.status !== "Active" ? " (Draft)" : ""}</option>
        ))}
      </select>
      {value && (
        <a href="/home" target="_blank" rel="noreferrer" className="text-sm text-forest-400 hover:text-forest-300 font-medium">
          Open app &rarr;
        </a>
      )}
      <span className="text-xs text-gray-500">Only changes what you see.</span>
    </div>
  );
}
