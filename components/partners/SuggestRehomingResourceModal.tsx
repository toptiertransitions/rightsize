"use client";

import { useEffect, useState } from "react";
import { submitRehomingResourceAction } from "@/app/(protected)/partners/actions";
import { ACCEPT_BUCKETS, REHOMING_TYPES, type AcceptBucket, type RehomingType } from "@/lib/partners/rehoming";

const TYPE_CARDS: Record<RehomingType, { title: string; blurb: string }> = {
  "Collector/Reseller": { title: "Reseller / Collector", blurb: "Buys specific items to resell or collect" },
  "Consignment Store": { title: "Consignment Store", blurb: "Sells items and splits the proceeds" },
  "Donation Org": { title: "Donation Org", blurb: "Accepts donated items" },
};

interface Props {
  /** Admins' additions go live immediately; everyone else's go for approval. */
  isAdmin: boolean;
  onClose: () => void;
  onAddedLive: () => void;
}

const inputCls = "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-200 focus:border-forest-300";

export function SuggestRehomingResourceModal({ isAdmin, onClose, onAddedLive }: Props) {
  const [vendorType, setVendorType] = useState<RehomingType | null>(null);
  const [vendorName, setVendorName] = useState("");
  const [buckets, setBuckets] = useState<AcceptBucket[]>([]);
  const [otherItems, setOtherItems] = useState("");
  const [consignmentTake, setConsignmentTake] = useState("");
  const [pocName, setPocName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "pending" | "live">(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !submitting) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorType) { setError("Pick what kind of resource this is."); return; }
    setSubmitting(true);
    setError(null);
    const res = await submitRehomingResourceAction({
      vendorType,
      vendorName,
      buckets,
      otherItems,
      pocName,
      phone,
      email,
      website,
      address,
      city,
      state,
      zip,
      consignmentTake: Number(consignmentTake) || 0,
      notes,
    });
    setSubmitting(false);
    if (!res.ok) { setError(res.error); return; }
    setDone(res.live ? "live" : "pending");
    if (res.live) onAddedLive();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={() => { if (!submitting) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="suggest-resource-title"
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 border-b border-gray-100">
          <div>
            <h2 id="suggest-resource-title" className="text-lg font-bold text-gray-900">Add New Resource</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isAdmin ? "You're an admin, so this goes live right away." : "An admin reviews it, then it's added for the whole team."}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Close" className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
          </button>
        </div>

        {done ? (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-forest-50 text-forest-600 flex items-center justify-center mb-3">
              <svg className="w-6 h-6" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
            </div>
            <p className="font-semibold text-gray-900">{done === "live" ? `${vendorName.trim()} is live` : "Sent for approval"}</p>
            <p className="text-sm text-gray-500 mt-1">
              {done === "live" ? "It's now in Rehoming Resources for all staff." : "We emailed the admins. You'll get an email as soon as it's reviewed."}
            </p>
            <button type="button" onClick={onClose} className="mt-6 h-10 px-6 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="overflow-y-auto px-6 py-5 space-y-5">
            <fieldset>
              <legend className="text-sm font-semibold text-gray-900 mb-2">What kind of resource?</legend>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {REHOMING_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setVendorType(t)}
                    aria-pressed={vendorType === t}
                    className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${vendorType === t ? "border-forest-600 bg-forest-50 ring-1 ring-forest-600" : "border-gray-200 hover:border-forest-300"}`}
                  >
                    <span className="block text-sm font-semibold text-gray-900">{TYPE_CARDS[t].title}</span>
                    <span className="block text-xs text-gray-500 mt-0.5 leading-snug">{TYPE_CARDS[t].blurb}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="block">
              <span className="text-sm font-semibold text-gray-900">Name</span>
              <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} required placeholder="e.g. Habitat for Humanity ReStore – Wheaton" className={`${inputCls} mt-1.5`} />
            </label>

            <fieldset>
              <legend className="text-sm font-semibold text-gray-900">What do they take?</legend>
              <p className="text-xs text-gray-500 mb-2">Pick all that apply.</p>
              <div className="flex flex-wrap gap-1.5">
                {ACCEPT_BUCKETS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    aria-pressed={buckets.includes(b)}
                    onClick={() => setBuckets((l) => (l.includes(b) ? l.filter((x) => x !== b) : [...l, b]))}
                    className={`text-xs rounded-full border px-3 py-1.5 transition-colors ${buckets.includes(b) ? "bg-forest-600 border-forest-600 text-white" : "bg-white border-gray-200 text-gray-700 hover:border-forest-300"}`}
                  >
                    {b}
                  </button>
                ))}
              </div>
              <input value={otherItems} onChange={(e) => setOtherItems(e.target.value)} placeholder="Anything specific? e.g. pianos, militaria, mid-century modern" className={`${inputCls} mt-2`} />
            </fieldset>

            {vendorType === "Consignment Store" && (
              <label className="block">
                <span className="text-sm font-semibold text-gray-900">Store&rsquo;s consignment take</span>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={consignmentTake}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setConsignmentTake(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                    placeholder="e.g. 40"
                    className={`${inputCls} w-24`}
                  />
                  <span className="text-sm text-gray-500">% (leave blank if unsure)</span>
                </div>
              </label>
            )}

            <fieldset>
              <legend className="text-sm font-semibold text-gray-900">Contact</legend>
              <p className="text-xs text-gray-500 mb-2">At least a phone, email or website.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input value={pocName} onChange={(e) => setPocName(e.target.value)} placeholder="Contact name" className={inputCls} />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="Phone" className={inputCls} />
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" className={inputCls} />
                <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website" className={inputCls} />
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-semibold text-gray-900">Location</legend>
              <p className="text-xs text-gray-500 mb-2">The zip lets staff find them by distance. Leave blank if they&rsquo;re online only.</p>
              <div className="grid grid-cols-6 gap-2">
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street address" className={`${inputCls} col-span-6`} />
                <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className={`${inputCls} col-span-3`} />
                <input value={state} onChange={(e) => setState(e.target.value.slice(0, 2))} placeholder="ST" className={`${inputCls} col-span-1 uppercase`} />
                <input value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" placeholder="Zip" className={`${inputCls} col-span-2`} />
              </div>
            </fieldset>

            <label className="block">
              <span className="text-sm font-semibold text-gray-900">Notes for the team</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Pickup offered? Hours, minimums, what they won't take, how you know them…"
                className={`${inputCls} mt-1.5 resize-none`}
              />
            </label>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}

            <div className="flex gap-2 pt-1 pb-1">
              <button type="button" onClick={onClose} disabled={submitting} className="flex-1 h-11 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={submitting} className="flex-1 h-11 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 disabled:opacity-50">
                {submitting ? "Sending…" : isAdmin ? "Add resource" : "Send for approval"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
