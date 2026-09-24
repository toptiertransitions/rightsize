"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, CircleMarker } from "leaflet";
import { Pagination } from "../components/Pagination";
import type { LocalVendor } from "@/lib/types";

const PAGE_SIZE = 100;

const US_STATES: Array<{ code: string; name: string }> = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
];

interface ZipRecord {
  zip: string;
  city: string;
  lat: number;
  lng: number;
}

function parseZipList(zipCodesServed: string): string[] {
  return zipCodesServed.split(/[,\s]+/).map((z) => z.trim()).filter(Boolean);
}

interface Props {
  vendors: LocalVendor[];
}

export function ZipCoverageTab({ vendors }: Props) {
  const [vendorQuery, setVendorQuery] = useState("");
  const [vendorDropdownOpen, setVendorDropdownOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<LocalVendor | null>(null);

  const [stateCode, setStateCode] = useState("IL");
  const [stateZips, setStateZips] = useState<ZipRecord[]>([]);
  const [loadingZips, setLoadingZips] = useState(false);
  const [zipError, setZipError] = useState("");

  const [selectedZips, setSelectedZips] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [radiusZip, setRadiusZip] = useState("");
  const [radiusMiles, setRadiusMiles] = useState("");
  const [radiusLoading, setRadiusLoading] = useState(false);
  const [radiusMsg, setRadiusMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Map<string, CircleMarker>>(new Map());

  // A session-local copy of the vendor list, updated in place on every save
  // so re-selecting a partner from the picker — even after saving another
  // partner in between — always shows the just-saved coverage immediately.
  // Without this, the picker kept handing back the original server-rendered
  // `vendors` prop, silently reverting to pre-save zips until a full page
  // reload re-fetched it.
  const [localVendors, setLocalVendors] = useState<LocalVendor[]>(vendors);
  useEffect(() => setLocalVendors(vendors), [vendors]);

  const filteredVendors = useMemo(() => {
    const q = vendorQuery.trim().toLowerCase();
    if (!q) return localVendors.slice(0, 20);
    return localVendors.filter((v) => v.vendorName.toLowerCase().includes(q)).slice(0, 20);
  }, [vendorQuery, localVendors]);

  // Load a partner's current coverage — keyed on id (not the object itself)
  // so saving doesn't itself re-trigger this and wipe the just-set saveMsg.
  useEffect(() => {
    if (!selectedVendor) return;
    setSelectedZips(new Set(parseZipList(selectedVendor.zipCodesServed)));
    setDirty(false);
    setSaveMsg(null);
    const vendorState = selectedVendor.state?.trim().toUpperCase();
    if (vendorState && US_STATES.some((s) => s.code === vendorState)) setStateCode(vendorState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVendor?.id]);

  // Load the chosen state's zip list
  useEffect(() => {
    let cancelled = false;
    setLoadingZips(true);
    setZipError("");
    setPage(1);
    fetch(`/api/admin/zip-coverage?state=${stateCode}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setStateZips(d.zips ?? []); })
      .catch(() => { if (!cancelled) setZipError("Couldn't load zip codes for this state."); })
      .finally(() => { if (!cancelled) setLoadingZips(false); });
    return () => { cancelled = true; };
  }, [stateCode]);

  const filteredStateZips = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stateZips;
    return stateZips.filter((z) => z.zip.startsWith(q) || z.city.toLowerCase().includes(q));
  }, [stateZips, search]);

  const pageZips = filteredStateZips.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectedInState = stateZips.filter((z) => selectedZips.has(z.zip)).length;

  function toggleZip(zip: string) {
    setSelectedZips((prev) => {
      const next = new Set(prev);
      if (next.has(zip)) next.delete(zip);
      else next.add(zip);
      return next;
    });
    setDirty(true);
    setSaveMsg(null);
  }

  function selectAllInState() {
    setSelectedZips((prev) => new Set([...prev, ...stateZips.map((z) => z.zip)]));
    setDirty(true);
    setSaveMsg(null);
  }

  function clearAllInState() {
    setSelectedZips((prev) => {
      const next = new Set(prev);
      for (const z of stateZips) next.delete(z.zip);
      return next;
    });
    setDirty(true);
    setSaveMsg(null);
  }

  async function handleAddRadius() {
    const zip = radiusZip.trim();
    const miles = Number(radiusMiles);
    if (!/^\d{5}$/.test(zip)) { setRadiusMsg({ text: "Enter a valid 5-digit zip code.", ok: false }); return; }
    if (!Number.isFinite(miles) || miles <= 0) { setRadiusMsg({ text: "Enter a radius in miles.", ok: false }); return; }

    setRadiusLoading(true);
    setRadiusMsg(null);
    try {
      const res = await fetch(`/api/admin/zip-coverage?zip=${zip}&radiusMiles=${miles}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't look up that radius");
      const found: ZipRecord[] = d.zips ?? [];
      let added = 0;
      setSelectedZips((prev) => {
        const next = new Set(prev);
        for (const z of found) { if (!next.has(z.zip)) added++; next.add(z.zip); }
        return next;
      });
      setDirty(true);
      setSaveMsg(null);
      setRadiusMsg({
        text: `Added ${added.toLocaleString()} new zip${added !== 1 ? "s" : ""} (${found.length.toLocaleString()} total within ${miles} mi of ${zip}).`,
        ok: true,
      });
    } catch (e) {
      setRadiusMsg({ text: e instanceof Error ? e.message : "Couldn't look up that radius", ok: false });
    } finally {
      setRadiusLoading(false);
    }
  }

  async function handleSave() {
    if (!selectedVendor) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const zipCodesServed = [...selectedZips].sort().join(",");
      const res = await fetch("/api/local-vendors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedVendor.id, zipCodesServed }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to save");
      // Update the session-local vendor copy (not selectedVendor itself —
      // that would re-trigger the id-keyed load effect above) so the picker
      // reflects this immediately if the user switches away and back.
      setLocalVendors((prev) => prev.map((v) => (v.id === selectedVendor.id ? { ...v, zipCodesServed } : v)));
      setDirty(false);
      setSaveMsg(`Saved — ${selectedZips.size.toLocaleString()} zip${selectedZips.size !== 1 ? "s" : ""} total.`);
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // ─── Leaflet map lifecycle ──────────────────────────────────────────────────
  useEffect(() => {
    if (viewMode !== "map" || !mapContainerRef.current || mapRef.current) return;
    let disposed = false;
    import("leaflet").then((L) => {
      if (disposed || !mapContainerRef.current || mapRef.current) return;
      const map = L.map(mapContainerRef.current, { preferCanvas: true }).setView([39.5, -98.35], 4);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 12,
      }).addTo(map);
      mapRef.current = map;
      renderMarkers(L);
    });
    return () => { disposed = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  function renderMarkers(L: typeof import("leaflet")) {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();

    const bounds: [number, number][] = [];
    for (const z of stateZips) {
      const selected = selectedZips.has(z.zip);
      const marker = L.circleMarker([z.lat, z.lng], {
        radius: selected ? 6 : 4,
        weight: selected ? 2 : 1,
        color: selected ? "#2E6B4F" : "#6b7280",
        fillColor: selected ? "#4ade80" : "#9ca3af",
        fillOpacity: selected ? 0.85 : 0.45,
      }).addTo(map);
      marker.bindTooltip(`${z.zip} — ${z.city}`, { direction: "top", offset: [0, -4] });
      marker.on("click", () => toggleZip(z.zip));
      markersRef.current.set(z.zip, marker);
      bounds.push([z.lat, z.lng]);
    }
    if (bounds.length > 0) map.fitBounds(bounds, { padding: [24, 24] });
  }

  // Re-render markers when the state's zip list changes (view already open)
  useEffect(() => {
    if (viewMode !== "map" || !mapRef.current) return;
    import("leaflet").then((L) => renderMarkers(L));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateZips, viewMode]);

  // Update marker styling in place when selection changes — avoids
  // rebuilding the whole layer (and losing map pan/zoom) on every click.
  useEffect(() => {
    if (viewMode !== "map") return;
    markersRef.current.forEach((marker, zip) => {
      const selected = selectedZips.has(zip);
      marker.setStyle({
        radius: selected ? 6 : 4,
        weight: selected ? 2 : 1,
        color: selected ? "#2E6B4F" : "#6b7280",
        fillColor: selected ? "#4ade80" : "#9ca3af",
        fillOpacity: selected ? 0.85 : 0.45,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedZips, viewMode]);

  const stateName = US_STATES.find((s) => s.code === stateCode)?.name ?? stateCode;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Zip Coverage</h1>
        <p className="text-gray-400 mt-1">
          Map any partner to the zip codes, towns, or areas they serve — drives the Partners page&rsquo;s
          &ldquo;serves your area&rdquo; matching.
        </p>
      </div>

      {/* Partner picker */}
      <div className="relative max-w-md mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-1.5">Partner</label>
        <input
          type="text"
          value={selectedVendor ? selectedVendor.vendorName : vendorQuery}
          onChange={(e) => {
            setSelectedVendor(null);
            setVendorQuery(e.target.value);
            setVendorDropdownOpen(true);
          }}
          onFocus={() => setVendorDropdownOpen(true)}
          onBlur={() => setTimeout(() => setVendorDropdownOpen(false), 150)}
          placeholder="Search partners by name…"
          className="w-full h-11 px-3 rounded-xl border border-gray-600 bg-gray-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-forest-500/40"
        />
        {vendorDropdownOpen && !selectedVendor && filteredVendors.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-gray-800 border border-gray-700 rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto">
            {filteredVendors.map((v) => (
              <button
                key={v.id}
                type="button"
                onMouseDown={() => { setSelectedVendor(v); setVendorQuery(""); setVendorDropdownOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700"
              >
                <span className="text-gray-100">{v.vendorName}</span>
                <span className="text-gray-500"> — {v.vendorType}{v.city ? ` · ${v.city}, ${v.state}` : ""}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!selectedVendor ? (
        <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/60 p-10 text-center text-gray-500">
          Search for a partner above to map their zip coverage.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-gray-900 border border-gray-700 rounded-2xl px-5 py-4">
            <div>
              <p className="text-sm text-gray-400">Editing coverage for</p>
              <p className="text-lg font-bold text-white">{selectedVendor.vendorName}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {selectedZips.size.toLocaleString()} zip{selectedZips.size !== 1 ? "s" : ""} served total
                {stateZips.length > 0 && ` · ${selectedInState.toLocaleString()} in ${stateName}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {saveMsg && <span className="text-xs text-gray-400">{saveMsg}</span>}
              <button
                onClick={handleSave}
                disabled={!dirty || saving}
                className="h-10 px-5 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? "Saving…" : dirty ? "Save Changes" : "Saved"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 mb-4 bg-gray-900 border border-gray-700 rounded-2xl px-5 py-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Home Zip Code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={5}
                value={radiusZip}
                onChange={(e) => setRadiusZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder="60601"
                className="w-28 h-10 px-3 rounded-xl border border-gray-600 bg-gray-800 text-white text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-forest-500/40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Radius (miles)</label>
              <input
                type="text"
                inputMode="numeric"
                value={radiusMiles}
                onChange={(e) => setRadiusMiles(e.target.value.replace(/\D/g, "").slice(0, 3))}
                placeholder="25"
                className="w-24 h-10 px-3 rounded-xl border border-gray-600 bg-gray-800 text-white text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-forest-500/40"
              />
            </div>
            <button
              onClick={handleAddRadius}
              disabled={radiusLoading}
              className="h-10 px-4 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700 transition-colors disabled:opacity-40"
            >
              {radiusLoading ? "Searching…" : "Add Zips in Radius"}
            </button>
            {radiusMsg && (
              <span className={`text-xs ${radiusMsg.ok ? "text-forest-400" : "text-red-400"}`}>{radiusMsg.text}</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select
              value={stateCode}
              onChange={(e) => setStateCode(e.target.value)}
              className="h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none"
            >
              {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>

            <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
              <button
                onClick={() => setViewMode("list")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === "list" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"}`}
              >
                List
              </button>
              <button
                onClick={() => setViewMode("map")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === "map" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"}`}
              >
                Map
              </button>
            </div>

            <button
              onClick={selectAllInState}
              disabled={loadingZips || stateZips.length === 0}
              className="h-10 px-4 rounded-xl border border-forest-600 text-forest-400 text-sm font-medium hover:bg-forest-600/10 transition-colors disabled:opacity-40"
            >
              Select All {stateCode} Zips ({stateZips.length.toLocaleString()})
            </button>
            <button
              onClick={clearAllInState}
              disabled={loadingZips || selectedInState === 0}
              className="h-10 px-4 rounded-xl border border-gray-600 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-40"
            >
              Clear {stateCode} Zips
            </button>

            {viewMode === "list" && (
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search zip or city…"
                className="h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none w-56 ml-auto"
              />
            )}
          </div>

          {zipError && <p className="text-sm text-red-400 mb-4">{zipError}</p>}

          {viewMode === "list" ? (
            loadingZips ? (
              <div className="text-center py-16 text-gray-500">Loading {stateName} zip codes…</div>
            ) : (
              <div className="bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-gray-800">
                  {pageZips.map((z) => {
                    const selected = selectedZips.has(z.zip);
                    return (
                      <button
                        key={z.zip}
                        onClick={() => toggleZip(z.zip)}
                        className={`flex items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                          selected ? "bg-forest-900/40 hover:bg-forest-900/60" : "bg-gray-900 hover:bg-gray-800"
                        }`}
                      >
                        <span className={`w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center ${
                          selected ? "bg-forest-600 border-forest-600" : "border-gray-600"
                        }`}>
                          {selected && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium tabular-nums text-white">{z.zip}</span>
                          <span className="block text-xs text-gray-500 truncate">{z.city}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="px-2">
                  <Pagination currentPage={page} totalItems={filteredStateZips.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
                </div>
              </div>
            )
          ) : (
            <div className="rounded-2xl overflow-hidden border border-gray-700">
              <div ref={mapContainerRef} className="w-full h-[560px] bg-gray-800" />
              <div className="flex items-center gap-4 px-4 py-2.5 bg-gray-900 text-xs text-gray-400">
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-400" /> Covered</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-400" /> Not covered</span>
                <span className="text-gray-500">Click a point to toggle coverage</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
