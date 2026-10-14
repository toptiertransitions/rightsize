"use client";

import { useMemo, useRef, useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { Search, Star, X } from "lucide-react";
import { setPreferredPartnerAction } from "../preferred-actions";

export interface PickablePartner {
  id: string;
  name: string;
  categories: string[];
  lifecycle: string;
  city: string;
}

// Tenant Config: the marketplace partners this community recommends. Its
// clients see them labeled "<Community> Preferred Partner" and ranked first
// in matching (when they also meet the usual criteria). Many-to-many: any
// number per category, and a partner can be preferred by many communities.
export function PreferredPartnersEditor({
  brandId,
  communityName,
  initialIds,
  partners,
  canEdit,
}: {
  brandId: string;
  communityName: string;
  initialIds: string[];
  partners: PickablePartner[];
  canEdit: boolean;
}) {
  const [ids, setIds] = useState(initialIds);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [, start] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const byId = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners]);
  const chosen = ids.map((id) => byId.get(id)).filter((p): p is PickablePartner => !!p);

  // Grouped by category so it's clear what clients will see where
  const groups = useMemo(() => {
    const m = new Map<string, PickablePartner[]>();
    for (const p of chosen) for (const c of p.categories.length ? p.categories : ["Uncategorized"]) m.set(c, [...(m.get(c) ?? []), p]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [chosen]);

  const q = query.trim().toLowerCase();
  const results = partners
    .filter((p) => !ids.includes(p.id))
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.categories.some((c) => c.toLowerCase().includes(q)) || p.city.toLowerCase().includes(q))
    .slice(0, 40);

  function toggle(id: string, preferred: boolean) {
    setBusy(id);
    setError("");
    start(async () => {
      const r = await setPreferredPartnerAction(brandId, id, preferred);
      setBusy(null);
      if (!r.ok) return setError(r.error);
      setIds(r.ids);
      if (preferred) { setQuery(""); setOpen(false); }
    });
  }

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Star className="w-4 h-4 text-amber-300" />
        <h2 className="text-base font-bold text-white">Preferred partners</h2>
        <span className="text-xs text-gray-500">{chosen.length}</span>
      </div>
      <p className="text-sm text-gray-400 mb-4">
        Clients tied to {communityName} (referred by it, using its join link or code, or moving there) see these partners labeled
        <span className="text-amber-200"> &ldquo;{communityName} Preferred Partner&rdquo;</span> and ranked first, as long as they also match the client&rsquo;s area and needs. Add as many as you like, in any category.
      </p>

      {canEdit && (
        <div ref={boxRef} className="relative mb-4">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Add a partner: search by name, category or town"
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-gray-500"
          />
          {open && (
            <ul className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl py-1">
              {results.length === 0 ? (
                <li className="px-3 py-2 text-sm text-gray-500">No matching partners</li>
              ) : results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => toggle(p.id, true)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-800 disabled:opacity-50"
                  >
                    <span className="text-sm text-white">{p.name}</span>
                    <span className="ml-2 text-xs text-gray-500">{[p.categories.join(", "), p.city, p.lifecycle !== "Live" ? p.lifecycle : ""].filter(Boolean).join(" · ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {chosen.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-700 px-4 py-6 text-center text-sm text-gray-500">
          No preferred partners yet.{canEdit ? " Search above to add the first one (for example, the realtor this community recommends)." : ""}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(([category, list]) => (
            <div key={category}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">{category}</p>
              <ul className="space-y-1.5">
                {list.map((p) => (
                  <li key={`${category}-${p.id}`} className={`flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2 ${busy === p.id ? "opacity-50" : ""}`}>
                    <Star className="w-3.5 h-3.5 text-amber-300 flex-shrink-0" fill="currentColor" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/marketplace/partners/${p.id}`} className="text-sm text-white hover:underline">{p.name}</Link>
                      <p className="text-xs text-gray-500">
                        {[p.city, p.lifecycle].filter(Boolean).join(" · ")}
                        {p.lifecycle !== "Live" && <span className="text-amber-400"> · only Live partners appear in matching</span>}
                      </p>
                    </div>
                    {canEdit && (
                      <button type="button" disabled={busy === p.id} onClick={() => toggle(p.id, false)} aria-label={`Remove ${p.name}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-gray-800">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-400 mt-3" role="alert">{error}</p>}
      {!canEdit && <p className="text-xs text-gray-500 mt-3">Only TTT Admins can change preferred partners.</p>}
    </section>
  );
}
