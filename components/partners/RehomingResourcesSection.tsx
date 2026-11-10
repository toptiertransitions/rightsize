"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SuggestRehomingResourceModal } from "./SuggestRehomingResourceModal";
import { rehomingDistancesAction } from "@/app/(protected)/partners/actions";
import {
  ACCEPT_BUCKETS,
  DEFAULT_RADIUS_MILES,
  RADIUS_OPTIONS,
  REHOMING_TYPES,
  REHOMING_TYPE_LABELS,
  filterRehomingResources,
  letterFor,
  servesZip,
  sortKey,
  type AcceptBucket,
  type RehomingResource,
  type RehomingType,
} from "@/lib/partners/rehoming";

export interface RehomingSectionData {
  resources: RehomingResource[];
  /** Project origin zip — the default search center. */
  projectZip: string;
  initialDistances: Record<string, number> | null;
  canManage: boolean;
}

const TYPE_STYLES: Record<RehomingType, string> = {
  "Collector/Reseller": "bg-violet-50 text-violet-700 border-violet-200",
  "Consignment Store": "bg-amber-50 text-amber-800 border-amber-200",
  "Donation Org": "bg-sky-50 text-sky-700 border-sky-200",
};

const TYPE_SHORT: Record<RehomingType, string> = {
  "Collector/Reseller": "Reseller / Collector",
  "Consignment Store": "Consignment",
  "Donation Org": "Donation",
};

function money(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

function priceRange(min: number, max: number): string {
  if (min > 0 && max > 0) return `${money(min)}–${money(max)}`;
  if (min > 0) return `${money(min)}+`;
  if (max > 0) return `up to ${money(max)}`;
  return "";
}

function websiteHref(url: string): string {
  return url.startsWith("http") ? url : `https://${url}`;
}

function cleanDomain(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

function fullAddress(r: RehomingResource): string {
  const cityState = [r.city, [r.state, r.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [r.address, cityState].filter(Boolean).join(", ");
}

function contactText(r: RehomingResource): string {
  return [
    r.name,
    r.contactName && `Contact: ${r.contactName}`,
    r.phone && `Phone: ${r.phone}`,
    r.email && `Email: ${r.email}`,
    r.website && `Website: ${r.website}`,
    fullAddress(r) && `Address: ${fullAddress(r)}`,
  ].filter(Boolean).join("\n");
}

export function RehomingResourcesSection({ resources, projectZip, initialDistances, canManage }: RehomingSectionData) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<RehomingType[]>([]);
  const [buckets, setBuckets] = useState<AcceptBucket[]>([]);
  const [radius, setRadius] = useState<number | null>(DEFAULT_RADIUS_MILES);
  const [includeOnline, setIncludeOnline] = useState(true);
  const [sort, setSort] = useState<"az" | "near">("az");

  const [zipInput, setZipInput] = useState(projectZip);
  const [originZip, setOriginZip] = useState(projectZip);
  const [distances, setDistances] = useState(initialDistances);
  const [zipError, setZipError] = useState<string | null>(projectZip && !initialDistances ? `We couldn't find zip ${projectZip}.` : null);
  const [zipPending, startZip] = useTransition();
  const lookupSeq = useRef(0);

  // Re-measure once a full 5-digit zip is typed. Until it resolves, the
  // previous zip's distances stay in effect.
  useEffect(() => {
    const zip = zipInput.trim();
    if (zip === originZip) return;
    if (!/^\d{5}$/.test(zip)) {
      if (zip === "") {
        setOriginZip("");
        setDistances(null);
        setZipError(null);
      }
      return;
    }
    const seq = ++lookupSeq.current;
    startZip(async () => {
      const res = await rehomingDistancesAction(zip);
      if (seq !== lookupSeq.current) return;
      if (res.ok) {
        setOriginZip(zip);
        setDistances(res.distances);
        setZipError(null);
      } else {
        setZipError(res.error);
      }
    });
  }, [zipInput, originZip]);

  const availableBuckets = useMemo(
    () => ACCEPT_BUCKETS.filter((b) => resources.some((r) => r.buckets.includes(b))),
    [resources]
  );

  const typeCounts = useMemo(() => {
    const c = {} as Record<RehomingType, number>;
    for (const t of REHOMING_TYPES) c[t] = resources.filter((r) => r.type === t).length;
    return c;
  }, [resources]);

  const results = useMemo(() => {
    const list = filterRehomingResources(
      resources,
      { query: query.trim(), types, buckets, radiusMiles: radius, originZip, includeOnline },
      distances
    );
    if (sort === "near" && distances) {
      return [...list].sort((a, b) => (distances[a.id] ?? Infinity) - (distances[b.id] ?? Infinity) || sortKey(a.name).localeCompare(sortKey(b.name)));
    }
    return list;
  }, [resources, query, types, buckets, radius, originZip, includeOnline, distances, sort]);

  const groups = useMemo(() => {
    if (sort === "near" && distances) return [{ letter: "", items: results }];
    const out: { letter: string; items: RehomingResource[] }[] = [];
    for (const r of results) {
      const letter = letterFor(r.name);
      const last = out[out.length - 1];
      if (last?.letter === letter) last.items.push(r);
      else out.push({ letter, items: [r] });
    }
    return out;
  }, [results, sort, distances]);

  const hasFilters = query.trim() !== "" || types.length > 0 || buckets.length > 0 || radius !== DEFAULT_RADIUS_MILES || !includeOnline || zipInput.trim() !== projectZip;

  const clearFilters = () => {
    setQuery("");
    setTypes([]);
    setBuckets([]);
    setRadius(DEFAULT_RADIUS_MILES);
    setIncludeOnline(true);
    setZipInput(projectZip);
  };

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <section id="rehoming-resources" className="mt-14 scroll-mt-28">
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 whitespace-nowrap">Rehoming Resources</h2>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Staff only</span>
        <div className="h-px flex-1 bg-gray-200" />
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex-shrink-0 inline-flex items-center gap-1 text-sm font-medium text-forest-700 bg-forest-50 border border-forest-200 rounded-xl px-3 py-1.5 hover:bg-forest-100"
        >
          <span aria-hidden="true" className="text-base leading-none">+</span>
          <span className="hidden sm:inline">Add New Resource</span>
          <span className="sm:hidden">Add</span>
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-4 leading-relaxed">
        Resellers, collectors, consignment stores and donation orgs near this client. Pick what you&rsquo;re rehoming to see who takes it.
        {canManage && (
          <>
            {" "}
            <Link href="/admin/local-vendors" className="text-forest-600 hover:underline whitespace-nowrap">Manage list</Link>
          </>
        )}
      </p>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, city or item (e.g. piano, clothing)"
          className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-200 focus:border-forest-300"
        />

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Near zip</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={5}
              value={zipInput}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setZipInput(e.target.value.replace(/\D/g, ""))}
              placeholder="Zip"
              className="w-24 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-200 focus:border-forest-300"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Within</span>
            <select
              value={radius ?? "any"}
              onChange={(e) => setRadius(e.target.value === "any" ? null : Number(e.target.value))}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-forest-200 focus:border-forest-300"
            >
              {RADIUS_OPTIONS.map((m) => (
                <option key={m} value={m}>{m} miles</option>
              ))}
              <option value="any">Any distance</option>
            </select>
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Sort</span>
            <div className="inline-flex rounded-xl border border-gray-200 p-0.5 text-sm">
              {(["az", "near"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSort(s)}
                  disabled={s === "near" && !distances}
                  className={`px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 ${sort === s ? "bg-forest-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  {s === "az" ? "A–Z" : "Nearest"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs -mt-2 min-h-[1rem]">
          {zipPending ? (
            <span className="text-gray-400">Measuring distances…</span>
          ) : zipError ? (
            <span className="text-red-600">{zipError}</span>
          ) : originZip && originZip === projectZip ? (
            <span className="text-gray-400">Using this project&rsquo;s zip. Distances are straight-line.</span>
          ) : originZip ? (
            <span className="text-gray-400">
              Distances from {originZip}.{" "}
              {projectZip && (
                <button type="button" onClick={() => setZipInput(projectZip)} className="text-forest-600 hover:underline">Back to project zip ({projectZip})</button>
              )}
            </span>
          ) : (
            <span className="text-gray-400">{projectZip ? "Enter a zip to filter by distance." : "No project zip on file. Enter one to filter by distance."}</span>
          )}
        </p>

        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">Type</p>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={types.length === 0} onClick={() => setTypes([])}>All</Chip>
            {REHOMING_TYPES.map((t) => (
              <Chip key={t} active={types.includes(t)} onClick={() => setTypes((l) => toggle(l, t))}>
                {REHOMING_TYPE_LABELS[t]} <span className="opacity-60">{typeCounts[t]}</span>
              </Chip>
            ))}
          </div>
        </div>

        {availableBuckets.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">What are you rehoming?</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={buckets.length === 0} onClick={() => setBuckets([])}>Anything</Chip>
              {availableBuckets.map((b) => (
                <Chip key={b} active={buckets.includes(b)} onClick={() => setBuckets((l) => toggle(l, b))}>{b}</Chip>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-100">
          <label className="flex items-center gap-2 text-sm text-gray-600 pt-3">
            <input type="checkbox" checked={includeOnline} onChange={(e) => setIncludeOnline(e.target.checked)} className="rounded border-gray-300 text-forest-600 focus:ring-forest-200" />
            Include online / no-address resources
          </label>
          <div className="flex items-center gap-3 pt-3 text-sm">
            <span className="text-gray-500">{results.length} of {resources.length}</span>
            {hasFilters && (
              <button type="button" onClick={clearFilters} className="text-forest-600 hover:underline">Reset</button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5">
        {resources.length === 0 ? (
          <EmptyBox>No rehoming resources yet. Add Donation Orgs, Consignment Stores and Collectors/Resellers in Local Vendors.</EmptyBox>
        ) : results.length === 0 ? (
          <EmptyBox>
            Nothing matches.{" "}
            {radius != null && distances ? "Try a wider distance or " : "Try "}
            <button type="button" onClick={clearFilters} className="text-forest-600 hover:underline">resetting the filters</button>.
          </EmptyBox>
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <div key={g.letter || "all"}>
                {g.letter && <p className="text-xs font-bold text-gray-400 mb-2 pl-1">{g.letter}</p>}
                <ul className="space-y-2.5">
                  {g.items.map((r) => (
                    <ResourceCard key={r.id} r={r} miles={distances?.[r.id]} serves={servesZip(r, originZip)} activeBuckets={buckets} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <SuggestRehomingResourceModal isAdmin={canManage} onClose={() => setShowAdd(false)} onAddedLive={() => router.refresh()} />
      )}
    </section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-xs sm:text-[13px] rounded-full border px-3 py-1.5 transition-colors ${
        active ? "bg-forest-600 border-forest-600 text-white" : "bg-white border-gray-200 text-gray-700 hover:border-forest-300"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-8 text-center text-sm text-gray-500">{children}</div>
  );
}

function ResourceCard({ r, miles, serves, activeBuckets }: { r: RehomingResource; miles?: number; serves: boolean; activeBuckets: AcceptBucket[] }) {
  const [copied, setCopied] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const address = fullAddress(r);
  const longNotes = r.notes.length > 160;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(contactText(r));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked; nothing to do
    }
  };

  return (
    <li className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 leading-snug">{r.name}</h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span className={`text-[11px] font-medium border rounded-full px-2 py-0.5 ${TYPE_STYLES[r.type]}`}>{TYPE_SHORT[r.type]}</span>
            {!r.hasLocation ? (
              <span className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">Online / no address</span>
            ) : miles != null ? (
              <span className="text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">{miles < 1 ? "< 1" : miles.toFixed(miles < 10 ? 1 : 0)} mi</span>
            ) : null}
            {serves && <span className="text-[11px] text-forest-700 bg-forest-50 border border-forest-200 rounded-full px-2 py-0.5">Serves this zip</span>}
            {(r.city || r.state) && <span className="text-xs text-gray-400">{[r.city, r.state].filter(Boolean).join(", ")}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={copy}
          className="flex-shrink-0 text-xs text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50"
        >
          {copied ? "Copied" : "Copy contact"}
        </button>
      </div>

      {(r.acceptsRaw.length > 0 || r.wants.length > 0) ? (
        <div className="mt-3">
          {r.acceptsRaw.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-gray-500 mr-0.5">Accepts:</span>
              {r.acceptsRaw.map((a) => (
                <span key={a} className="text-xs text-gray-700 bg-gray-100 rounded-md px-1.5 py-0.5">{a}</span>
              ))}
            </div>
          )}
          {r.wants.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              <span className="text-xs text-gray-500 mr-0.5">Looking for:</span>
              {r.wants.map((w) => {
                const range = priceRange(w.minPrice, w.maxPrice);
                return (
                  <span key={w.category} className="text-xs text-violet-800 bg-violet-50 rounded-md px-1.5 py-0.5">
                    {w.category}{range && <span className="opacity-70"> · {range}</span>}
                  </span>
                );
              })}
            </div>
          )}
          {activeBuckets.length > 0 && r.buckets.some((b) => activeBuckets.includes(b)) && (
            <p className="text-[11px] text-forest-700 mt-1.5">Matches: {r.buckets.filter((b) => activeBuckets.includes(b)).join(", ")}</p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-400">Accepted items not listed. Call to confirm.</p>
      )}

      {r.consignmentTake > 0 && (
        <p className="mt-2 text-xs text-gray-600">Consignment take: {r.consignmentTake}%</p>
      )}

      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {r.contactName && <Row label="Contact">{r.contactName}</Row>}
        {r.phone && <Row label="Phone"><a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="text-forest-600 hover:underline">{r.phone}</a></Row>}
        {r.email && <Row label="Email"><a href={`mailto:${r.email}`} className="text-forest-600 hover:underline break-all">{r.email}</a></Row>}
        {r.website && <Row label="Website"><a href={websiteHref(r.website)} target="_blank" rel="noopener noreferrer" className="text-forest-600 hover:underline break-all">{cleanDomain(r.website)}</a></Row>}
        {address && (
          <Row label="Address" wide>
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.name} ${address}`)}`} target="_blank" rel="noopener noreferrer" className="text-forest-600 hover:underline">{address}</a>
          </Row>
        )}
      </dl>

      {r.notes && (
        <div className="mt-3 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-line">
          {longNotes && !notesOpen ? `${r.notes.slice(0, 160).trimEnd()}…` : r.notes}
          {longNotes && (
            <button type="button" onClick={() => setNotesOpen((o) => !o)} className="ml-1 text-forest-600 hover:underline">
              {notesOpen ? "Less" : "More"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function Row({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex gap-2 min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-gray-400 w-16 flex-shrink-0">{label}</dt>
      <dd className="text-gray-800 min-w-0">{children}</dd>
    </div>
  );
}
