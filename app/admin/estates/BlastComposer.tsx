"use client";

import { useState, useEffect } from "react";
import type { EstateSaleShopper, Estate } from "@/lib/types";

interface BlastItem {
  id: string;
  itemName: string;
  photoUrl?: string;
  valueMid?: number;
  onlineListingSlug?: string;
  category?: string;
}

type Tab = "compose" | "content" | "recipients";

const CATEGORY_OPTIONS = ["Furniture", "Jewelry", "Art", "Vintage", "Décor", "Other"];

function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function BlastComposer({
  shoppers,
  estates,
  onClose,
}: {
  shoppers: EstateSaleShopper[];
  estates: Estate[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("compose");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [brief, setBrief] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState("");

  // Content
  const [availableItems, setAvailableItems] = useState<BlastItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [selectedEstateIds, setSelectedEstateIds] = useState<Set<string>>(new Set());
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Recipients
  const [filterCategory, setFilterCategory] = useState("");

  // Send
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [sendError, setSendError] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Preview
  const [preview, setPreview] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Eligible recipient count
  const eligibleShoppers = shoppers.filter(s => {
    if (s.optOut) return false;
    if (filterCategory) {
      return (s.categoryInterests ?? "").toLowerCase().includes(filterCategory.toLowerCase());
    }
    return true;
  });

  const featuredEstates = estates.filter(e => selectedEstateIds.has(e.id));
  const featuredItems = availableItems.filter(i => selectedItemIds.has(i.id));

  useEffect(() => {
    // Load PF items when user opens the content tab
    if (tab === "content" && availableItems.length === 0 && !itemsLoading) {
      setItemsLoading(true);
      fetch("/api/admin/blast-context")
        .then(r => r.json())
        .then(d => setAvailableItems(d.items ?? []))
        .catch(() => {})
        .finally(() => setItemsLoading(false));
    }
  }, [tab, availableItems.length, itemsLoading]);

  async function handleDraft() {
    if (!brief.trim()) { setDraftError("Enter a brief first."); return; }
    setDrafting(true);
    setDraftError("");
    try {
      const res = await fetch("/api/admin/estate-blast/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: brief.trim(),
          estateNames: featuredEstates.map(e => e.name),
          itemNames: featuredItems.map(i => i.itemName),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draft failed");
      if (data.subject) setSubject(data.subject);
      if (data.body) setBodyText(data.body);
    } catch (e) {
      setDraftError(String(e));
    } finally {
      setDrafting(false);
    }
  }

  async function handlePreview() {
    if (!subject.trim() || !bodyText.trim()) return;
    setPreviewing(true);
    try {
      const res = await fetch("/api/admin/estate-blast/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          bodyText,
          featuredEstates: featuredEstates.map(e => ({
            id: e.id, name: e.name, slug: e.slug,
            saleStartDate: e.saleStartDate, description: e.description, status: e.status,
          })),
          featuredItems: featuredItems.map(i => ({
            id: i.id, itemName: i.itemName, photoUrl: i.photoUrl,
            valueMid: i.valueMid, onlineListingSlug: i.onlineListingSlug, category: i.category,
          })),
        }),
      });
      const data = await res.json();
      setPreview(data.html ?? null);
    } catch {
      // ignore preview failure
    } finally {
      setPreviewing(false);
    }
  }

  async function handleTestSend() {
    if (!subject.trim() || !bodyText.trim()) {
      setSendError("Subject and body are required.");
      return;
    }
    setTestSending(true);
    setTestResult(null);
    setSendError("");
    try {
      const res = await fetch("/api/admin/estate-blast/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          bodyText,
          featuredEstates: featuredEstates.map(e => ({
            id: e.id, name: e.name, slug: e.slug,
            saleStartDate: e.saleStartDate, description: e.description, status: e.status,
          })),
          featuredItems: featuredItems.map(i => ({
            id: i.id, itemName: i.itemName, photoUrl: i.photoUrl,
            valueMid: i.valueMid, onlineListingSlug: i.onlineListingSlug, category: i.category,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Test send failed");
      setTestResult(data.sentTo);
    } catch (e) {
      setSendError(String(e));
    } finally {
      setTestSending(false);
    }
  }

  async function handleSend() {
    if (!subject.trim() || !bodyText.trim()) {
      setSendError("Subject and body are required.");
      return;
    }
    if (eligibleShoppers.length === 0) {
      setSendError("No eligible recipients.");
      return;
    }
    if (!confirm(`Send to ${eligibleShoppers.length} shopper${eligibleShoppers.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setSending(true);
    setSendError("");
    setSendResult(null);
    try {
      const res = await fetch("/api/admin/estate-blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          bodyText,
          filterCategory: filterCategory || undefined,
          featuredEstates: featuredEstates.map(e => ({
            id: e.id, name: e.name, slug: e.slug,
            saleStartDate: e.saleStartDate, description: e.description, status: e.status,
          })),
          featuredItems: featuredItems.map(i => ({
            id: i.id, itemName: i.itemName, photoUrl: i.photoUrl,
            valueMid: i.valueMid, onlineListingSlug: i.onlineListingSlug, category: i.category,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      setSendResult(data);
    } catch (e) {
      setSendError(String(e));
    } finally {
      setSending(false);
    }
  }

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`;

  const inputCls = "w-full bg-gray-800 border border-gray-700 text-gray-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-forest-500 placeholder-gray-600";

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-stretch justify-center p-4">
      <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-5xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-white">Send Email Blast</h2>
            <p className="text-xs text-gray-500 mt-0.5">ProFoundFinds branded · individually sent · reply-to info@profoundfinds.com</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-2xl leading-none">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3 border-b border-gray-800 pb-3">
          <button className={tabCls("compose")} onClick={() => setTab("compose")}>1 · Compose</button>
          <button className={tabCls("content")} onClick={() => setTab("content")}>
            2 · Add Content
            {(selectedEstateIds.size + selectedItemIds.size) > 0 && (
              <span className="ml-1.5 text-xs bg-forest-700 text-forest-200 px-1.5 py-0.5 rounded-full">
                {selectedEstateIds.size + selectedItemIds.size}
              </span>
            )}
          </button>
          <button className={tabCls("recipients")} onClick={() => setTab("recipients")}>3 · Recipients</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── Compose ─────────────────────────────────────────────────── */}
          {tab === "compose" && (
            <div className="space-y-5">
              {/* AI draft */}
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">AI Draft Assistant</p>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  value={brief}
                  onChange={e => setBrief(e.target.value)}
                  placeholder="Describe your email in plain English… e.g. 'Announce the Henderson estate sale with mid-century furniture starting Friday'"
                />
                <button
                  onClick={handleDraft}
                  disabled={drafting || !brief.trim()}
                  className="mt-2 px-4 py-1.5 bg-forest-700 hover:bg-forest-600 text-white text-sm rounded-lg disabled:opacity-50 transition-colors"
                >
                  {drafting ? "Drafting…" : "Draft with AI →"}
                </button>
                {draftError && <p className="text-red-400 text-xs mt-2">{draftError}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Subject line</label>
                <input className={inputCls} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Your subject…" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Email body</label>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={10}
                  value={bodyText}
                  onChange={e => setBodyText(e.target.value)}
                  placeholder="Write your email here (plain text — separate paragraphs with a blank line)…"
                />
                <p className="text-xs text-gray-600 mt-1">Separate paragraphs with a blank line. No HTML needed — it will be formatted automatically.</p>
              </div>

              {/* Live preview */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Preview</p>
                  <button
                    onClick={handlePreview}
                    disabled={previewing || !subject.trim() || !bodyText.trim()}
                    className="text-xs px-3 py-1 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors"
                  >
                    {previewing ? "Generating…" : "Refresh preview"}
                  </button>
                </div>
                {preview ? (
                  <iframe
                    srcDoc={preview}
                    className="w-full rounded-xl border border-gray-700"
                    style={{ height: 480 }}
                    sandbox="allow-same-origin"
                  />
                ) : (
                  <div className="w-full rounded-xl border border-gray-700 bg-gray-900 flex items-center justify-center" style={{ height: 200 }}>
                    <p className="text-gray-600 text-sm">Fill in subject and body, then click "Refresh preview"</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Content ─────────────────────────────────────────────────── */}
          {tab === "content" && (
            <div className="space-y-6">
              {/* Estate sales */}
              <div>
                <p className="text-sm font-semibold text-white mb-3">Featured Estate Sales <span className="text-gray-500 font-normal text-xs">(optional)</span></p>
                {estates.length === 0 ? (
                  <p className="text-gray-500 text-sm">No estate sales found.</p>
                ) : (
                  <div className="space-y-2">
                    {estates.map(e => (
                      <label key={e.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-900 border border-gray-800 cursor-pointer hover:border-gray-600 transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedEstateIds.has(e.id)}
                          onChange={ev => {
                            const next = new Set(selectedEstateIds);
                            ev.target.checked ? next.add(e.id) : next.delete(e.id);
                            setSelectedEstateIds(next);
                          }}
                          className="mt-0.5 rounded border-gray-600"
                        />
                        <div>
                          <div className="text-sm font-medium text-gray-100">{e.name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {e.status} · {e.saleStartDate ? new Date(e.saleStartDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "No date set"}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* ProFoundFinds items */}
              <div>
                <p className="text-sm font-semibold text-white mb-3">Featured ProFoundFinds Items <span className="text-gray-500 font-normal text-xs">(optional — active Listed consignment items)</span></p>
                {itemsLoading ? (
                  <p className="text-gray-500 text-sm">Loading items…</p>
                ) : availableItems.length === 0 ? (
                  <p className="text-gray-500 text-sm">No active ProFoundFinds consignment items found.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {availableItems.map(item => {
                      const selected = selectedItemIds.has(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            const next = new Set(selectedItemIds);
                            selected ? next.delete(item.id) : next.add(item.id);
                            setSelectedItemIds(next);
                          }}
                          className={`text-left rounded-xl border transition-colors overflow-hidden ${selected ? "border-forest-500 bg-forest-900/20" : "border-gray-700 bg-gray-900 hover:border-gray-500"}`}
                        >
                          {item.photoUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.photoUrl} alt={item.itemName} className="w-full h-28 object-cover" />
                          )}
                          <div className="p-2.5">
                            <p className="text-xs font-medium text-gray-100 leading-tight line-clamp-2">{item.itemName}</p>
                            {item.valueMid ? <p className="text-xs text-emerald-400 mt-1">{fmt(item.valueMid)}</p> : null}
                            {item.category && <p className="text-xs text-gray-600 mt-0.5">{item.category}</p>}
                          </div>
                          {selected && (
                            <div className="px-2.5 pb-2 text-xs text-forest-400 font-medium">✓ Selected</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Recipients ──────────────────────────────────────────────── */}
          {tab === "recipients" && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Total shoppers", value: shoppers.length },
                  { label: "Active (not opted out)", value: shoppers.filter(s => !s.optOut).length },
                  { label: "Will receive this blast", value: eligibleShoppers.length },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                    <div className="text-2xl font-bold text-white">{value}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-sm font-semibold text-white mb-3">Filter by category interest <span className="text-gray-500 font-normal text-xs">(leave blank for all active shoppers)</span></p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setFilterCategory("")}
                    className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${!filterCategory ? "bg-forest-700 border-forest-500 text-white" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}
                  >
                    All active shoppers
                  </button>
                  {CATEGORY_OPTIONS.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setFilterCategory(filterCategory === cat ? "" : cat)}
                      className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${filterCategory === cat ? "bg-forest-700 border-forest-500 text-white" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Opted-out shoppers</p>
                <p className="text-sm text-gray-400">
                  {shoppers.filter(s => s.optOut).length} shopper{shoppers.filter(s => s.optOut).length !== 1 ? "s" : ""} have opted out and will never receive emails.
                  They are always excluded automatically.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 px-6 py-4 flex items-center justify-between gap-4">
          <div className="text-sm text-gray-500">
            {eligibleShoppers.length} recipient{eligibleShoppers.length !== 1 ? "s" : ""}
            {filterCategory ? ` interested in ${filterCategory}` : ""}
            {(selectedEstateIds.size + selectedItemIds.size) > 0 && ` · ${selectedEstateIds.size} estate${selectedEstateIds.size !== 1 ? "s" : ""} + ${selectedItemIds.size} item${selectedItemIds.size !== 1 ? "s" : ""} featured`}
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            {sendResult && (
              <span className="text-sm text-green-400 font-medium">
                Sent {sendResult.sent}/{sendResult.total}{sendResult.failed > 0 ? ` · ${sendResult.failed} failed` : ""}
              </span>
            )}
            {testResult && (
              <span className="text-sm text-blue-400 font-medium">Test sent to {testResult}</span>
            )}
            {sendError && <span className="text-sm text-red-400">{sendError}</span>}
            <button onClick={onClose} className="px-4 py-2 bg-gray-800 text-gray-300 text-sm rounded-lg hover:bg-gray-700 transition-colors">
              {sendResult ? "Close" : "Cancel"}
            </button>
            {!sendResult && (
              <>
                <button
                  onClick={handleTestSend}
                  disabled={testSending || !subject.trim() || !bodyText.trim()}
                  className="px-4 py-2 bg-gray-700 border border-gray-600 text-gray-200 text-sm rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-colors"
                >
                  {testSending ? "Sending…" : "Send test to me"}
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending || !subject.trim() || !bodyText.trim() || eligibleShoppers.length === 0}
                  className="px-5 py-2 bg-forest-600 text-white text-sm font-semibold rounded-lg hover:bg-forest-700 disabled:opacity-50 transition-colors"
                >
                  {sending ? `Sending…` : `Send to ${eligibleShoppers.length} shopper${eligibleShoppers.length !== 1 ? "s" : ""}`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
