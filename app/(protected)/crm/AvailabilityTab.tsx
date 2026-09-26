"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WeeklySchedule, TimeOffEntry, SystemRole } from "@/lib/types";

interface AvailabilityStaff {
  clerkUserId: string;
  name: string;
  role: SystemRole;
  address: string | null;
  profileImageUrl: string | null;
  weeklySchedule: WeeklySchedule | null;
  timeOff: TimeOffEntry[];
}

interface GeoStaff extends AvailabilityStaff {
  lat: number;
  lng: number;
}

const DEFAULT_RADIUS = 15;

// ─── Google Maps loader (module-level singleton, same pattern as the Staff
// page's LocationMgmtTab — geocoding-only here, no map/Places needed) ─────────
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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    script.async = true;
    script.defer = true;
    script.onload = () => { gmapsLoaded = true; resolve(); };
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return gmapsLoading;
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Same day-of-week / time-off logic as the Plan page's helper-conflict
// check (PlanClient.tsx), simplified to date-only since this tool has no
// shift time to compare against — any time-off entry on the date, or a
// weekly-schedule day marked unavailable, counts as unavailable.
const ISO_TO_DAY: Record<number, keyof WeeklySchedule> = {
  0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat",
};

function isAvailableOnDate(member: AvailabilityStaff, dateStr: string): boolean {
  if (member.timeOff?.some((t) => t.date === dateStr)) return false;
  if (member.weeklySchedule) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    const sched = member.weeklySchedule[ISO_TO_DAY[dow]];
    if (sched && !sched.available) return false;
  }
  return true;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function PersonRow({ member, distance }: { member: GeoStaff; distance: number }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors">
      {member.profileImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={member.profileImageUrl} alt={member.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-gray-200" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-forest-100 text-forest-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
          {initials(member.name)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">{member.name}</p>
        <p className="text-xs text-gray-400">{distance.toFixed(1)} mi away</p>
      </div>
    </div>
  );
}

export default function AvailabilityTab() {
  const [zip, setZip] = useState("");
  const [date, setDate] = useState(todayISO());
  // Kept as raw text, not a number, while the field is being edited — a
  // controlled numeric value snaps back the instant the field goes empty
  // (Number("") || fallback), which makes the leading digit undeletable
  // when trying to retype (e.g. 15 -> 20). Clamped to a real number only
  // when actually used below, and cleaned up on blur.
  const [radiusInput, setRadiusInput] = useState(String(DEFAULT_RADIUS));
  const radiusMiles = Math.max(1, Math.min(200, Math.round(Number(radiusInput)) || DEFAULT_RADIUS));

  const [staff, setStaff] = useState<AvailabilityStaff[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState("");

  const [mapsReady, setMapsReady] = useState(false);
  const [mapsError, setMapsError] = useState("");

  const [geocodedStaff, setGeocodedStaff] = useState<GeoStaff[]>([]);
  const [noAddressCount, setNoAddressCount] = useState(0);
  const [geocodingStaff, setGeocodingStaff] = useState(false);
  const geocodedForRef = useRef<string>(""); // staff-list fingerprint already geocoded

  const [queryLatLng, setQueryLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [zipLookupError, setZipLookupError] = useState("");
  const [zipLookupLoading, setZipLookupLoading] = useState(false);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  // Load staff pool once
  useEffect(() => {
    setStaffLoading(true);
    setStaffError("");
    fetch("/api/crm/staff-availability")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setStaff(d.staff ?? []);
      })
      .catch(() => setStaffError("Couldn't load the staff list."))
      .finally(() => setStaffLoading(false));
  }, []);

  // Load Google Maps
  useEffect(() => {
    if (!apiKey) { setMapsError("Google Maps isn't configured."); return; }
    loadGMaps(apiKey).then(() => setMapsReady(true)).catch(() => setMapsError("Failed to load Google Maps."));
  }, [apiKey]);

  // Geocode the staff pool's addresses once, whenever the pool changes
  useEffect(() => {
    if (!mapsReady || staff.length === 0) return;
    const fingerprint = staff.map((s) => s.clerkUserId + s.address).join("|");
    if (geocodedForRef.current === fingerprint) return;
    geocodedForRef.current = fingerprint;

    const withAddr = staff.filter((s) => s.address?.trim());
    setNoAddressCount(staff.length - withAddr.length);
    if (withAddr.length === 0) { setGeocodedStaff([]); return; }

    setGeocodingStaff(true);
    const geocoder = new window.google.maps.Geocoder();
    Promise.all(
      withAddr.map(
        (s) =>
          new Promise<GeoStaff | null>((resolve) => {
            geocoder.geocode({ address: s.address! }, (results, status) => {
              if (status === "OK" && results?.[0]) {
                resolve({ ...s, lat: results[0].geometry.location.lat(), lng: results[0].geometry.location.lng() });
              } else {
                resolve(null);
              }
            });
          })
      )
    )
      .then((results) => setGeocodedStaff(results.filter((r): r is GeoStaff => r !== null)))
      .finally(() => setGeocodingStaff(false));
  }, [mapsReady, staff]);

  // Geocode the entered zip
  useEffect(() => {
    if (!mapsReady || !/^\d{5}$/.test(zip)) { setQueryLatLng(null); setZipLookupError(""); return; }
    setZipLookupLoading(true);
    setZipLookupError("");
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address: zip, componentRestrictions: { country: "US" } }, (results, status) => {
      setZipLookupLoading(false);
      if (status === "OK" && results?.[0]) {
        setQueryLatLng({ lat: results[0].geometry.location.lat(), lng: results[0].geometry.location.lng() });
      } else {
        setQueryLatLng(null);
        setZipLookupError("Couldn't find that zip code.");
      }
    });
  }, [mapsReady, zip]);

  // Distance + date-availability, recomputed live as radius/date change —
  // no extra API calls needed since everything's already geocoded.
  const results = useMemo(() => {
    if (!queryLatLng) return null;
    const inRadius = geocodedStaff
      .map((s) => ({ member: s, distance: haversineMiles(queryLatLng.lat, queryLatLng.lng, s.lat, s.lng) }))
      .filter((r) => r.distance <= radiusMiles)
      .sort((a, b) => a.distance - b.distance);

    const available = inRadius.filter((r) => isAvailableOnDate(r.member, date));
    const teamLeads = available.filter((r) => r.member.role === "TTTTeamLead");
    const staffOnly = available.filter((r) => r.member.role === "TTTStaff");
    return { inRadiusCount: inRadius.length, teamLeads, staffOnly };
  }, [queryLatLng, geocodedStaff, radiusMiles, date]);

  const loading = staffLoading || geocodingStaff || zipLookupLoading;

  return (
    <div>
      <div className="mb-6 max-w-2xl">
        <h2 className="text-lg font-bold text-gray-900">Availability</h2>
        <p className="text-sm text-gray-500 mt-1">
          Find Team Leads and Staff who are available near a location on a given date — for planning only.
          Nothing here sends invites or notifications.
        </p>
      </div>

      {(staffError || mapsError) && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 max-w-2xl">
          {staffError || mapsError}
        </div>
      )}

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6 max-w-2xl">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Zip Code</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={5}
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
              placeholder="60601"
              className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-forest-500/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-forest-500/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Radius</label>
            <div className="relative">
              <input
                type="number"
                min={1}
                max={200}
                value={radiusInput}
                onChange={(e) => setRadiusInput(e.target.value)}
                onFocus={(e) => e.target.select()}
                onBlur={() => setRadiusInput(String(radiusMiles))}
                className="w-full h-11 pl-3 pr-10 rounded-xl border border-gray-300 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-forest-500/30"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">mi</span>
            </div>
          </div>
        </div>
        {zipLookupError && <p className="text-xs text-red-500 mt-2">{zipLookupError}</p>}
      </div>

      {/* Results */}
      {!zip || zip.length < 5 ? (
        <div className="max-w-2xl rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-10 text-center text-sm text-gray-400">
          Enter a 5-digit zip code to see who&rsquo;s available nearby.
        </div>
      ) : loading && !results ? (
        <div className="max-w-2xl rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">
          <div className="w-6 h-6 mx-auto mb-3 border-2 border-gray-200 border-t-forest-500 rounded-full animate-spin" />
          Finding available staff&hellip;
        </div>
      ) : results ? (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mb-2">
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Team Leads Available</p>
              <p className="text-3xl font-bold text-gray-900">{results.teamLeads.length}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Staff Available</p>
              <p className="text-3xl font-bold text-gray-900">{results.staffOnly.length}</p>
            </div>
          </div>

          <p className="text-xs text-gray-400 max-w-2xl mb-5">
            {results.inRadiusCount} total within {radiusMiles} mi of {zip}
            {noAddressCount > 0 && ` · ${noAddressCount} staff excluded (no address on file)`}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <div className="bg-white border border-gray-200 rounded-2xl p-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 px-3 pt-2 pb-1">Team Leads</p>
              {results.teamLeads.length === 0 ? (
                <p className="text-sm text-gray-400 px-3 py-4">None available.</p>
              ) : (
                results.teamLeads.map(({ member, distance }) => (
                  <PersonRow key={member.clerkUserId} member={member} distance={distance} />
                ))
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 px-3 pt-2 pb-1">Staff</p>
              {results.staffOnly.length === 0 ? (
                <p className="text-sm text-gray-400 px-3 py-4">None available.</p>
              ) : (
                results.staffOnly.map(({ member, distance }) => (
                  <PersonRow key={member.clerkUserId} member={member} distance={distance} />
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
