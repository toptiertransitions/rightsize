"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { ShelfMediaItem } from "@/lib/anthropic";
import type { ShelfAlertSessionLog } from "@/lib/email";

const VALUE_SCALE = 0.6;

function scale(v: number) { return Math.round(v * VALUE_SCALE); }

function mediaRoute(scaledMid: number): string {
  if (scaledMid >= 15) return "Online Marketplace";
  if (scaledMid >= 5) return "FB/Marketplace";
  return "Donate";
}

function fmt(n: number) {
  return `$${n}`;
}

function pluralType(items: ShelfMediaItem[]): string {
  const types = [...new Set(items.map(i => i.type))];
  if (types.length === 1) {
    const t = types[0];
    return t === "Album" ? "Albums" : t === "Other" ? "Media Items" : `${t}s`;
  }
  return "Media Items";
}

type ProcessedEntry = { action: "individual" | "lot" | "donate" };

interface Props {
  tenantId: string;
  tenantName: string;
  roomId?: string;
  shelfItems: ShelfMediaItem[];
  shelfPhotoUrl: string;
  shelfPhotoPublicId: string;
  onAddAnother: () => void;
}

export function ShelfAnalyzerView({
  tenantId,
  tenantName,
  roomId,
  shelfItems,
  shelfPhotoUrl,
  shelfPhotoPublicId,
  onAddAnother,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [processed, setProcessed] = useState<Map<number, ProcessedEntry>>(new Map());
  const [processing, setProcessing] = useState(false);
  const [processMessage, setProcessMessage] = useState("");
  const [error, setError] = useState("");
  const [sessionLog, setSessionLog] = useState<ShelfAlertSessionLog>({ individual: [], lots: [], donates: [] });
  const [finalized, setFinalized] = useState(false);

  const available = useMemo(
    () => shelfItems.map((item, i) => ({ item, i })).filter(({ i }) => !processed.has(i)),
    [shelfItems, processed]
  );
  const allAvailableSelected = available.length > 0 && available.every(({ i }) => selected.has(i));
  const selectedList = useMemo(
    () => [...selected].sort((a, b) => a - b).map(i => ({ item: shelfItems[i], i })),
    [selected, shelfItems]
  );

  function toggleAll() {
    if (allAvailableSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(available.map(({ i }) => i)));
    }
  }

  function toggleItem(idx: number) {
    if (processed.has(idx)) return;
    setSelected(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  function markProcessed(indices: number[], action: ProcessedEntry["action"]) {
    setProcessed(prev => {
      const next = new Map(prev);
      indices.forEach(i => next.set(i, { action }));
      return next;
    });
    setSelected(prev => {
      const next = new Set(prev);
      indices.forEach(i => next.delete(i));
      return next;
    });
  }

  async function sendAlert(log: ShelfAlertSessionLog) {
    try {
      await fetch("/api/shelf-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, shelfImageUrl: shelfPhotoUrl, sessionLog: log }),
      });
    } catch (e) {
      console.error("[shelf-alert] failed:", e);
    }
  }

  async function handleCreateIndividual() {
    if (selectedList.length === 0) return;
    setProcessing(true);
    setError("");
    const newIndividual: ShelfAlertSessionLog["individual"] = [];

    try {
      for (let n = 0; n < selectedList.length; n++) {
        const { item, i } = selectedList[n];
        setProcessMessage(`Creating item ${n + 1} of ${selectedList.length}…`);
        const scaledMid = scale(item.value_mid);
        const route = mediaRoute(scaledMid);
        const itemName = [item.title, item.creator ? `by ${item.creator}` : ""].filter(Boolean).join(" ");

        await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId,
            roomId: roomId || undefined,
            photos: [{ url: shelfPhotoUrl, publicId: shelfPhotoPublicId }],
            photoUrl: shelfPhotoUrl,
            photoPublicId: shelfPhotoPublicId,
            itemName,
            category: "Books & Media",
            condition: item.condition,
            conditionNotes: item.notes || "",
            sizeClass: "Small & Shippable",
            fragility: "Not Fragile",
            itemType: "Daily Use",
            valueLow: scale(item.value_low),
            valueMid: scaledMid,
            valueHigh: scale(item.value_high),
            primaryRoute: route,
            routeReasoning: `Media item from shelf assessment. Estimated value: ${fmt(scaledMid)}.`,
            listingFb: `${itemName}. ${item.condition} condition.${item.notes ? " " + item.notes : ""}`.trim(),
            listingDescriptionEbay: `${itemName}.\n\nType: ${item.type}. Condition: ${item.condition}.${item.notes ? "\n\n" + item.notes : ""}`,
            staffTips: item.notes || "From shelf assessment batch.",
            quantity: 1,
          }),
        });

        newIndividual.push({ title: item.title, creator: item.creator, type: item.type, route });
        markProcessed([i], "individual");
      }

      const updated: ShelfAlertSessionLog = {
        ...sessionLog,
        individual: [...sessionLog.individual, ...newIndividual],
      };
      setSessionLog(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create items");
    } finally {
      setProcessing(false);
      setProcessMessage("");
    }
  }

  async function handleLot(routeType: "lot" | "donate") {
    if (selectedList.length === 0) return;
    setProcessing(true);
    setError("");

    try {
      setProcessMessage(routeType === "lot" ? "Creating sale lot…" : "Creating donation lot…");

      const items = selectedList.map(({ item }) => item);
      const lotName = `${items.length}-Item ${pluralType(items)} Lot`;
      const descLines = items.map((item, idx) => {
        const creator = item.creator ? ` by ${item.creator}` : "";
        return `${idx + 1}. ${item.title}${creator}`;
      });
      const description = descLines.join("\n");
      const totalMid = items.reduce((s, item) => s + scale(item.value_mid), 0);
      const primaryRoute = routeType === "lot" ? "FB/Marketplace" : "Donate";

      await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          roomId: roomId || undefined,
          photos: [{ url: shelfPhotoUrl, publicId: shelfPhotoPublicId }],
          photoUrl: shelfPhotoUrl,
          photoPublicId: shelfPhotoPublicId,
          itemName: lotName,
          category: "Books & Media",
          condition: "Good",
          conditionNotes: `Lot of ${items.length} items assessed from shelf photo.`,
          sizeClass: "Fits in Car-SUV",
          fragility: "Not Fragile",
          itemType: "Daily Use",
          valueLow: Math.round(totalMid * 0.6),
          valueMid: totalMid,
          valueHigh: Math.round(totalMid * 1.4),
          primaryRoute,
          routeReasoning: routeType === "lot"
            ? "Lot of media items — best sold as bundle on FB/Marketplace."
            : "Lot of media items designated for donation.",
          listingFb: routeType === "lot"
            ? `${lotName} for sale. Includes:\n${description}` : "",
          listingDescriptionEbay: description,
          staffTips: `Items listed in order of assessed value. Total: ${items.length} items.`,
          quantity: 1,
        }),
      });

      const lotData = {
        name: lotName,
        itemCount: items.length,
        items: items.map(item => item.creator ? `${item.title} by ${item.creator}` : item.title),
        route: primaryRoute,
      };

      const updated: ShelfAlertSessionLog =
        routeType === "lot"
          ? { ...sessionLog, lots: [...sessionLog.lots, lotData] }
          : { ...sessionLog, donates: [...sessionLog.donates, lotData] };
      setSessionLog(updated);

      markProcessed(selectedList.map(({ i }) => i), routeType === "lot" ? "lot" : "donate");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create lot");
    } finally {
      setProcessing(false);
      setProcessMessage("");
    }
  }

  async function handleFinalize() {
    setProcessing(true);
    setProcessMessage("Sending team notification…");
    await sendAlert(sessionLog);
    setFinalized(true);
    setProcessing(false);
    setProcessMessage("");
  }

  const totalProcessed = processed.size;
  const hasAnyWork = sessionLog.individual.length > 0 || sessionLog.lots.length > 0 || sessionLog.donates.length > 0;

  // ── Processing overlay ─────────────────────────────────────────────────────
  if (processing) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <div className="w-14 h-14 rounded-full border-4 border-forest-200 border-t-forest-600 animate-spin mb-6" />
        <p className="text-lg font-semibold text-gray-800">{processMessage || "Processing…"}</p>
        <p className="text-sm text-gray-400 mt-1">Please keep this tab open</p>
      </div>
    );
  }

  // ── Finalized / done ───────────────────────────────────────────────────────
  if (finalized) {
    const indCount = sessionLog.individual.length;
    const lotCount = sessionLog.lots.reduce((s, l) => s + l.itemCount, 0);
    const donateCount = sessionLog.donates.reduce((s, l) => s + l.itemCount, 0);

    return (
      <div className="max-w-2xl mx-auto py-10">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-forest-100 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Assessment Complete</h2>
          <p className="text-gray-500 mt-1">Team notification sent. Here&apos;s a summary of what was created.</p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="rounded-2xl border border-gray-200 p-5 text-center">
            <p className="text-3xl font-bold text-gray-900">{indCount}</p>
            <p className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">Individual Items</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
            <p className="text-3xl font-bold text-amber-700">{lotCount}</p>
            <p className="text-xs text-amber-600 mt-1 font-medium uppercase tracking-wide">In Sale Lots</p>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-center">
            <p className="text-3xl font-bold text-blue-700">{donateCount}</p>
            <p className="text-xs text-blue-600 mt-1 font-medium uppercase tracking-wide">Donated</p>
          </div>
        </div>

        {sessionLog.individual.length > 0 && (
          <div className="mb-4 rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
              <span className="text-sm font-semibold text-gray-700">For Sale Individually ({sessionLog.individual.length})</span>
            </div>
            <div className="divide-y divide-gray-100">
              {sessionLog.individual.slice(0, 12).map((item, i) => (
                <div key={i} className="px-5 py-2.5 flex items-center justify-between">
                  <span className="text-sm text-gray-800 truncate">{item.title}{item.creator ? ` by ${item.creator}` : ""}</span>
                  <span className="text-xs text-gray-400 ml-3 flex-shrink-0">{item.route}</span>
                </div>
              ))}
              {sessionLog.individual.length > 12 && (
                <div className="px-5 py-2 text-xs text-gray-400">+{sessionLog.individual.length - 12} more</div>
              )}
            </div>
          </div>
        )}

        {sessionLog.lots.map((lot, i) => (
          <div key={i} className="mb-4 rounded-2xl border border-amber-200 overflow-hidden">
            <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0" />
              <span className="text-sm font-semibold text-amber-800">For Sale as Lot — {lot.name}</span>
            </div>
            <div className="px-5 py-3">
              <p className="text-xs text-gray-500 mb-2">{lot.itemCount} items · {lot.route}</p>
              <div className="space-y-1">
                {lot.items.slice(0, 8).map((title, j) => (
                  <p key={j} className="text-sm text-gray-700">{j + 1}. {title}</p>
                ))}
                {lot.items.length > 8 && <p className="text-xs text-gray-400">+{lot.items.length - 8} more</p>}
              </div>
            </div>
          </div>
        ))}

        {sessionLog.donates.map((lot, i) => (
          <div key={i} className="mb-4 rounded-2xl border border-blue-200 overflow-hidden">
            <div className="px-5 py-3 bg-blue-50 border-b border-blue-200 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
              <span className="text-sm font-semibold text-blue-800">Donation — {lot.name}</span>
            </div>
            <div className="px-5 py-3">
              <p className="text-xs text-gray-500 mb-2">{lot.itemCount} items · Donate</p>
              <div className="space-y-1">
                {lot.items.slice(0, 8).map((title, j) => (
                  <p key={j} className="text-sm text-gray-700">{j + 1}. {title}</p>
                ))}
                {lot.items.length > 8 && <p className="text-xs text-gray-400">+{lot.items.length - 8} more</p>}
              </div>
            </div>
          </div>
        ))}

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => router.push(`/catalog?tenantId=${tenantId}`)}
            className="flex-1 h-12 rounded-2xl bg-forest-600 text-white font-semibold hover:bg-forest-700 transition-colors"
          >
            View Catalog
          </button>
          <button
            onClick={onAddAnother}
            className="flex-1 h-12 rounded-2xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Add Another Item
          </button>
        </div>
      </div>
    );
  }

  // ── Main analyzer table ────────────────────────────────────────────────────
  const actionBarVisible = selectedList.length > 0;

  return (
    <div className="pb-36">
      {/* Header card */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden mb-5">
        <div className="flex gap-4 p-5 bg-white">
          {shelfPhotoUrl && (
            <div className="relative w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 border border-gray-100">
              <Image src={shelfPhotoUrl} alt="Shelf" fill className="object-cover" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-forest-700 bg-forest-50 border border-forest-200 px-2.5 py-1 rounded-full">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Shelf Analysis
              </span>
            </div>
            <h2 className="text-lg font-bold text-gray-900">{shelfItems.length} items identified</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Sorted by estimated value · {totalProcessed > 0 ? `${totalProcessed} processed, ` : ""}{available.length} remaining
            </p>
          </div>
        </div>

        {/* Legend */}
        {totalProcessed > 0 && (
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-4 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">Status:</span>
            <span className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-2 h-2 rounded-full bg-green-500" />Individual
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-2 h-2 rounded-full bg-amber-400" />Sale Lot
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-2 h-2 rounded-full bg-blue-400" />Donate
            </span>
          </div>
        )}
      </div>

      {/* Select controls */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleAll}
            disabled={available.length === 0}
            className="text-sm font-medium text-forest-600 hover:text-forest-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {allAvailableSelected ? "Deselect All" : "Select All"}
          </button>
          {selected.size > 0 && (
            <button onClick={() => setSelected(new Set())} className="text-sm text-gray-400 hover:text-gray-600">
              Clear
            </button>
          )}
        </div>
        <span className="text-sm text-gray-500">
          {selected.size > 0 ? `${selected.size} selected` : `${available.length} available`}
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[2rem_1fr_auto_auto_auto] gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <div />
          <div>Title</div>
          <div className="text-right hidden sm:block">Type</div>
          <div className="text-right hidden sm:block">Cond.</div>
          <div className="text-right">Est. Value</div>
        </div>

        {/* Rows */}
        {shelfItems.map((item, idx) => {
          const isProcessed = processed.has(idx);
          const isSelected = selected.has(idx);
          const entry = processed.get(idx);
          const scaledMid = scale(item.value_mid);

          const rowBg = isProcessed
            ? entry?.action === "individual" ? "bg-green-50/60"
              : entry?.action === "lot" ? "bg-amber-50/60"
              : "bg-blue-50/60"
            : isSelected ? "bg-forest-50/80"
            : "bg-white hover:bg-gray-50/80";

          const dotColor = entry?.action === "individual" ? "bg-green-500"
            : entry?.action === "lot" ? "bg-amber-400"
            : entry?.action === "donate" ? "bg-blue-400"
            : null;

          return (
            <div
              key={idx}
              onClick={() => toggleItem(idx)}
              className={`grid grid-cols-[2rem_1fr_auto_auto_auto] gap-2 px-4 py-3 border-b border-gray-100 last:border-0 transition-colors ${isProcessed ? "cursor-default" : "cursor-pointer"} ${rowBg}`}
            >
              {/* Checkbox / status */}
              <div className="flex items-center justify-center">
                {isProcessed && dotColor ? (
                  <span className={`w-3 h-3 rounded-full ${dotColor} flex-shrink-0`} />
                ) : (
                  <div className={`w-4.5 h-4.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    isSelected ? "bg-forest-600 border-forest-600" : "border-gray-300 bg-white"
                  }`}>
                    {isSelected && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                )}
              </div>

              {/* Title + rank */}
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-gray-400 flex-shrink-0">#{idx + 1}</span>
                  <span className="text-sm font-medium text-gray-900 truncate">{item.title}</span>
                </div>
                {item.creator && (
                  <p className="text-xs text-gray-400 truncate ml-6">{item.creator}</p>
                )}
                {item.notes && !isProcessed && (
                  <p className="text-xs text-amber-600 truncate ml-6 mt-0.5">{item.notes}</p>
                )}
              </div>

              {/* Type */}
              <div className="hidden sm:flex items-center">
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full whitespace-nowrap">{item.type}</span>
              </div>

              {/* Condition */}
              <div className="hidden sm:flex items-center">
                <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                  item.condition === "Excellent" ? "bg-green-100 text-green-700" :
                  item.condition === "Good" ? "bg-blue-100 text-blue-700" :
                  item.condition === "Fair" ? "bg-yellow-100 text-yellow-700" :
                  "bg-red-100 text-red-700"
                }`}>{item.condition}</span>
              </div>

              {/* Value */}
              <div className="flex items-center justify-end">
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-800">{fmt(scaledMid)}</p>
                  <p className="text-xs text-gray-400">{fmt(scale(item.value_low))}–{fmt(scale(item.value_high))}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sticky action bar */}
      {(actionBarVisible || hasAnyWork) && (
        <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
          <div className="pointer-events-auto max-w-5xl mx-auto px-4 pb-6">
            <div className="rounded-2xl border border-gray-200 bg-white/95 backdrop-blur-md shadow-2xl p-4">
              {actionBarVisible ? (
                <>
                  <p className="text-sm font-medium text-gray-700 mb-3">
                    {selectedList.length} item{selectedList.length !== 1 ? "s" : ""} selected
                    {" — "}est. value{" "}
                    <span className="font-semibold text-forest-700">
                      {fmt(selectedList.reduce((s, { item }) => s + scale(item.value_mid), 0))}
                    </span>
                  </p>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <button
                      onClick={handleCreateIndividual}
                      className="flex flex-col items-center justify-center gap-1 h-16 rounded-xl bg-forest-600 hover:bg-forest-700 text-white transition-colors px-2"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-xs font-semibold leading-tight text-center">Create Individual Items</span>
                    </button>
                    <button
                      onClick={() => handleLot("lot")}
                      className="flex flex-col items-center justify-center gap-1 h-16 rounded-xl bg-amber-500 hover:bg-amber-600 text-white transition-colors px-2"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      <span className="text-xs font-semibold leading-tight text-center">Lot for Sale</span>
                    </button>
                    <button
                      onClick={() => handleLot("donate")}
                      className="flex flex-col items-center justify-center gap-1 h-16 rounded-xl bg-blue-500 hover:bg-blue-600 text-white transition-colors px-2"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                      <span className="text-xs font-semibold leading-tight text-center">Donate This Lot</span>
                    </button>
                  </div>
                </>
              ) : null}

              {hasAnyWork && (
                <button
                  onClick={handleFinalize}
                  disabled={actionBarVisible}
                  className="w-full h-11 rounded-xl border-2 border-forest-600 text-forest-700 font-semibold text-sm hover:bg-forest-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Complete Assessment &amp; Notify Team
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
