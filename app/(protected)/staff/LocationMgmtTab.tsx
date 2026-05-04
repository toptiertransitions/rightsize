"use client";

import { useEffect, useRef, useState } from "react";
import type { StaffMember } from "@/lib/types";

const DEFAULT_PIN_COLOR = "#16A34A";

const ROLE_LABELS: Record<string, string> = {
  TTTAdmin: "Admin",
  TTTManager: "Manager",
  TTTSales: "Sales",
  TTTStaff: "Staff",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function makePinSvg(color: string, text: string) {
  const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="58">` +
        `<circle cx="24" cy="22" r="20" fill="${color}" stroke="white" stroke-width="2.5"/>` +
        `<text x="24" y="28" text-anchor="middle" fill="white" font-size="12" font-family="-apple-system,Helvetica,sans-serif" font-weight="700">${safe}</text>` +
        `<path d="M15 39 L24 58 L33 39 Z" fill="${color}"/>` +
      `</svg>`
    )
  );
}

function makeDestSvg() {
  return (
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="50">` +
        `<circle cx="20" cy="18" r="16" fill="#DC2626" stroke="white" stroke-width="2"/>` +
        `<text x="20" y="24" text-anchor="middle" fill="white" font-size="16" font-family="-apple-system,Helvetica,sans-serif" font-weight="700">★</text>` +
        `<path d="M12 31 L20 50 L28 31 Z" fill="#DC2626"/>` +
      `</svg>`
    )
  );
}

let gmapsLoaded = false;
let gmapsLoading: Promise<void> | null = null;

function loadGMaps(key: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (gmapsLoaded || (window as unknown as { google?: { maps?: unknown } }).google?.maps) {
    gmapsLoaded = true;
    return Promise.resolve();
  }
  if (gmapsLoading) return gmapsLoading;
  gmapsLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => { gmapsLoaded = true; resolve(); };
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return gmapsLoading;
}

type GeoStaff = StaffMember & { lat: number; lng: number };

export function LocationMgmtTab({ members }: { members: StaffMember[] }) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const destMarkerRef = useRef<google.maps.Marker | null>(null);
  const geocodedRef = useRef<GeoStaff[]>([]);

  const [mapsReady, setMapsReady] = useState(false);
  const [geocodedState, setGeocodedState] = useState<GeoStaff[]>([]);
  const [noAddr, setNoAddr] = useState<StaffMember[]>([]);
  const [distances, setDistances] = useState<Map<string, number>>(new Map());
  const [destLabel, setDestLabel] = useState("");
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState("");

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  useEffect(() => {
    if (!apiKey) return;
    loadGMaps(apiKey)
      .then(() => setMapsReady(true))
      .catch(() => setError("Failed to load Google Maps. Check your API key."));
  }, [apiKey]);

  // Initialize map + geocode + autocomplete once maps script is ready
  useEffect(() => {
    if (!mapsReady || !mapDivRef.current || mapRef.current) return;

    const map = new window.google.maps.Map(mapDivRef.current, {
      center: { lat: 41.8781, lng: -87.6298 }, // Chicago
      zoom: 9,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: "greedy",
      styles: [
        { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
      ],
    });
    mapRef.current = map;

    // Geocode staff with addresses
    const withAddr = members.filter(m => m.address?.trim());
    const withoutAddr = members.filter(m => !m.address?.trim());
    setNoAddr(withoutAddr);

    if (withAddr.length === 0) return;

    const geocoder = new window.google.maps.Geocoder();

    Promise.allSettled(
      withAddr.map(m =>
        new Promise<GeoStaff>((resolve, reject) => {
          geocoder.geocode({ address: m.address! }, (results, status) => {
            if (status === "OK" && results?.[0]) {
              resolve({
                ...m,
                lat: results[0].geometry.location.lat(),
                lng: results[0].geometry.location.lng(),
              });
            } else {
              reject();
            }
          });
        })
      )
    ).then(settled => {
      const geo = settled
        .filter((r): r is PromiseFulfilledResult<GeoStaff> => r.status === "fulfilled")
        .map(r => r.value);

      geocodedRef.current = geo;
      setGeocodedState(geo);

      geo.forEach(s => {
        const color = s.pinColor || DEFAULT_PIN_COLOR;
        const marker = new window.google.maps.Marker({
          position: { lat: s.lat, lng: s.lng },
          map,
          icon: {
            url: makePinSvg(color, initials(s.displayName)),
            scaledSize: new window.google.maps.Size(48, 58),
            anchor: new window.google.maps.Point(24, 58),
          },
          title: s.displayName,
        });

        const infoContent = [
          `<div style="font-family:-apple-system,Helvetica,sans-serif;padding:4px 0;min-width:160px">`,
          s.profileImageUrl
            ? `<img src="${s.profileImageUrl}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;margin-bottom:8px"/>`
            : "",
          `<p style="font-weight:700;font-size:14px;margin:0 0 2px;color:#111">${s.displayName}</p>`,
          `<p style="color:#6b7280;font-size:12px;margin:0">${ROLE_LABELS[s.role] ?? s.role}</p>`,
          s.address ? `<p style="color:#6b7280;font-size:12px;margin:4px 0 0">${s.address}</p>` : "",
          `</div>`,
        ].join("");

        const iw = new window.google.maps.InfoWindow({ content: infoContent });
        marker.addListener("click", () => iw.open(map, marker));
        markersRef.current.set(s.id, marker);
      });

      if (geo.length > 1) {
        const bounds = new window.google.maps.LatLngBounds();
        geo.forEach(s => bounds.extend({ lat: s.lat, lng: s.lng }));
        map.fitBounds(bounds, 60);
      } else if (geo.length === 1) {
        map.setCenter({ lat: geo[0].lat, lng: geo[0].lng });
        map.setZoom(13);
      }
    });

    // Places Autocomplete on search input
    if (searchInputRef.current) {
      const ac = new window.google.maps.places.Autocomplete(searchInputRef.current, {
        types: ["address"],
        componentRestrictions: { country: "us" },
        fields: ["geometry", "formatted_address"],
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place.geometry?.location) return;
        const label = place.formatted_address || searchInputRef.current?.value || "";
        setDestLabel(label);
        placeDestAndComputeDistances(place.geometry.location, map);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapsReady]);

  function placeDestAndComputeDistances(loc: google.maps.LatLng, map: google.maps.Map) {
    destMarkerRef.current?.setMap(null);

    const dm = new window.google.maps.Marker({
      position: loc,
      map,
      icon: {
        url: makeDestSvg(),
        scaledSize: new window.google.maps.Size(40, 50),
        anchor: new window.google.maps.Point(20, 50),
      },
      title: "Destination",
      zIndex: 1000,
    });
    destMarkerRef.current = dm;

    const geo = geocodedRef.current;

    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend(loc);
    if (geo.length > 0) {
      geo.forEach(s => bounds.extend({ lat: s.lat, lng: s.lng }));
      map.fitBounds(bounds, 80);
    } else {
      map.panTo(loc);
      map.setZoom(12);
    }

    if (geo.length === 0) return;

    setComputing(true);
    setDistances(new Map());

    const svc = new window.google.maps.DistanceMatrixService();
    svc.getDistanceMatrix(
      {
        origins: geo.map(s => new window.google.maps.LatLng(s.lat, s.lng)),
        destinations: [loc],
        travelMode: window.google.maps.TravelMode.DRIVING,
        unitSystem: window.google.maps.UnitSystem.IMPERIAL,
      },
      (response, status) => {
        setComputing(false);
        if (status !== "OK" || !response) return;
        const result = new Map<string, number>();
        response.rows.forEach((row, i) => {
          const el = row.elements[0];
          if (el.status === "OK") {
            result.set(geo[i].id, Math.round(el.distance.value * 0.000621371));
          }
        });
        setDistances(result);
      }
    );
  }

  function clearDest() {
    if (searchInputRef.current) searchInputRef.current.value = "";
    setDestLabel("");
    setDistances(new Map());
    setComputing(false);
    destMarkerRef.current?.setMap(null);
    destMarkerRef.current = null;
  }

  const sorted = [...geocodedState].sort((a, b) => {
    const da = distances.get(a.id);
    const db = distances.get(b.id);
    if (da !== undefined && db !== undefined) return da - db;
    if (da !== undefined) return -1;
    if (db !== undefined) return 1;
    return a.displayName.localeCompare(b.displayName);
  });

  if (!apiKey) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-6">
        <p className="font-semibold text-amber-800">Google Maps not configured</p>
        <p className="mt-1 text-sm text-amber-700">
          Add <code className="font-mono bg-amber-100 px-1 rounded">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to{" "}
          <code className="font-mono bg-amber-100 px-1 rounded">.env.local</code> to enable Location Management.
          The key needs the Maps JavaScript API, Places API, and Distance Matrix API enabled.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-6">
        <p className="font-semibold text-red-800">Map error</p>
        <p className="mt-1 text-sm text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search bar */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search an address to see driving distance from each team member…"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
          />
        </div>
        {destLabel && (
          <button
            onClick={clearDest}
            className="text-sm text-gray-500 hover:text-gray-800 whitespace-nowrap transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex gap-4" style={{ height: "calc(100vh - 310px)", minHeight: 520 }}>
        {/* Map */}
        <div className="flex-1 rounded-2xl overflow-hidden border border-gray-200 shadow-sm relative bg-gray-100">
          {!mapsReady && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm z-10">
              Loading map…
            </div>
          )}
          <div ref={mapDivRef} className="w-full h-full" />
        </div>

        {/* Sidebar */}
        <div className="w-72 flex flex-col gap-2 overflow-y-auto flex-shrink-0">
          {/* Destination summary */}
          {destLabel && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 flex-shrink-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-red-500 text-lg leading-none">★</span>
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Destination</p>
              </div>
              <p className="text-sm text-gray-800 leading-snug">{destLabel}</p>
              {computing && (
                <p className="text-xs text-gray-400 mt-1 animate-pulse">Computing driving distances…</p>
              )}
            </div>
          )}

          {/* Staff list */}
          {mapsReady && sorted.length === 0 && noAddr.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">
              No active staff found.
            </p>
          )}

          {mapsReady && sorted.length === 0 && noAddr.length > 0 && (
            <p className="text-sm text-gray-400 text-center py-6">
              No staff have addresses yet.<br />
              <span className="text-xs">Add them in Admin → Users → Manage.</span>
            </p>
          )}

          {sorted.map(s => {
            const miles = distances.get(s.id);
            const color = s.pinColor || DEFAULT_PIN_COLOR;
            return (
              <div
                key={s.id}
                onClick={() => {
                  mapRef.current?.panTo({ lat: s.lat, lng: s.lng });
                  mapRef.current?.setZoom(14);
                }}
                className="bg-white rounded-xl border border-gray-200 px-3 py-3 flex items-center gap-3 cursor-pointer hover:shadow-sm hover:border-gray-300 transition-all flex-shrink-0"
              >
                <div
                  className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: s.profileImageUrl ? "transparent" : color }}
                >
                  {s.profileImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.profileImageUrl} className="w-full h-full object-cover" alt="" />
                  ) : (
                    initials(s.displayName)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{s.displayName}</p>
                  <p className="text-xs text-gray-500 truncate">{s.address}</p>
                </div>
                {miles !== undefined && (
                  <div className="flex-shrink-0 text-right min-w-[40px]">
                    <p className="text-base font-bold text-gray-900 leading-tight">{miles}</p>
                    <p className="text-[10px] text-gray-400 leading-none">mi</p>
                  </div>
                )}
              </div>
            );
          })}

          {/* No-address members */}
          {noAddr.length > 0 && (
            <div className="mt-1 pt-2 border-t border-gray-100 flex-shrink-0">
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-2 px-1">
                No Address
              </p>
              {noAddr.map(s => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 mb-1.5"
                >
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0 overflow-hidden flex items-center justify-center text-gray-500 text-xs font-bold">
                    {s.profileImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.profileImageUrl} className="w-full h-full object-cover" alt="" />
                    ) : (
                      initials(s.displayName)
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-600 truncate font-medium">{s.displayName}</p>
                    <p className="text-xs text-gray-400">Set address in Admin</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
