"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enableBrandAction } from "./actions";

export function EnableBrandForm({ partners }: { partners: { id: string; name: string }[] }) {
  const router = useRouter();
  const [partnerId, setPartnerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function enable() {
    if (!partnerId) return;
    setBusy(true);
    setError("");
    const r = await enableBrandAction(partnerId);
    setBusy(false);
    if (r.ok && r.data) router.push(`/admin/marketplace/tenant-config/${r.data}`);
    else if (!r.ok) setError(r.error);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <select
          value={partnerId}
          onChange={(e) => setPartnerId(e.target.value)}
          className="h-9 px-3 rounded-lg border border-gray-700 bg-gray-950 text-sm text-white max-w-[260px]"
        >
          <option value="">Choose a marketplace partner…</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={enable} disabled={!partnerId || busy} className="h-9 px-4 rounded-lg bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 disabled:opacity-50 whitespace-nowrap">
          {busy ? "Enabling…" : "Enable tenant branding"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
