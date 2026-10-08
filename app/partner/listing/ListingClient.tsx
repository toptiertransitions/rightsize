"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { getPartnerCriteria, readMatchCriteria, currentCriteriaValues, type MatchCriteria } from "@/lib/partners/criteria";
import type { PartnerCategory } from "@/lib/types";
import type { MarketplaceFieldDef, MarketplaceLifecycleStatus, MarketplaceListingStatus } from "@/lib/marketplace/types";
import {
  BusinessFields, AboutFields, AreaFields, CriterionPicker, DetailsFields,
  businessValid, areaValid, parseZipText, editableFields,
  type BusinessData, type AboutData, type AreaData,
} from "../setup/SetupFields";
import { saveBusinessAction, saveAboutAction, saveServiceAreaAction, saveListingAction, requestCategoryChangeAction } from "../setup/actions";

interface ListingData {
  id: string;
  label: string;
  status: MarketplaceListingStatus;
  fieldSchema: MarketplaceFieldDef[];
  attributes: Record<string, unknown>;
}

type Result = { ok: true } | { ok: false; error: string };

const STATUS_COPY: Partial<Record<MarketplaceLifecycleStatus, { text: string; cls: string }>> = {
  Submitted: { text: "Under review. We'll let you know when your listing is live.", cls: "bg-amber-50 border-amber-200 text-amber-800" },
  Live: { text: "Live on Rightsize. Families in your area can be matched with you.", cls: "bg-forest-50 border-forest-200 text-forest-800" },
  Paused: { text: "Paused. You won't be matched with new families right now.", cls: "bg-gray-50 border-gray-200 text-gray-700" },
};

export function ListingClient({ status, business: b0, about: a0, area: ar0, listings }: {
  status: MarketplaceLifecycleStatus;
  business: BusinessData;
  about: AboutData;
  area: AreaData;
  listings: ListingData[];
}) {
  const router = useRouter();
  const [business, setBusiness] = useState(b0);
  const [about, setAbout] = useState(a0);
  const [area, setArea] = useState(ar0);
  const banner = STATUS_COPY[status];

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">My Listing</h1>
      <p className="text-sm text-gray-500 mt-1">What families see, and who we match you with. Changes save to your listing right away.</p>

      {banner && <div className={cn("mt-5 rounded-xl border px-4 py-3 text-sm", banner.cls)}>{banner.text}</div>}

      <div className="mt-6 space-y-5">
        <Card title="Business" valid={businessValid(business)} onSave={() => saveBusinessAction(business)} onSaved={() => router.refresh()}>
          <BusinessFields data={business} onChange={setBusiness} />
        </Card>
        <Card title="About" onSave={() => saveAboutAction(about)}>
          <AboutFields data={about} onChange={setAbout} />
        </Card>
        <Card
          title="Where you work"
          valid={areaValid(area)}
          onSave={() => saveServiceAreaAction({ deliveryMode: area.deliveryMode, counties: area.counties, extraZips: parseZipText(area.extraZipsText), statewide: area.statewide })}
        >
          <AreaFields data={area} onChange={setArea} />
        </Card>

        {listings.map((l) => <CategoryCards key={l.id} listing={l} />)}

        <CategoryChangeRequest current={listings.map((l) => l.label)} />
      </div>
    </div>
  );
}

function CategoryCards({ listing }: { listing: ListingData }) {
  const defs = getPartnerCriteria(listing.label as PartnerCategory);
  const [criteria, setCriteria] = useState<MatchCriteria>(() => readMatchCriteria(listing.attributes));
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...listing.attributes }));
  const fields = editableFields(listing.fieldSchema);

  return (
    <>
      {defs.length > 0 && (
        <Card
          title={`${listing.label}: who you serve`}
          subtitle="Matching updates as soon as you save."
          valid={defs.every((c) => currentCriteriaValues(c, criteria).length > 0)}
          onSave={() => saveListingAction(listing.id, { criteria: Object.fromEntries(defs.map((c) => [c.questionId, currentCriteriaValues(c, criteria)])) })}
        >
          <div className="space-y-6">
            {defs.map((c) => (
              <div key={c.questionId}>
                <p className="text-[15px] font-semibold text-gray-900">{c.prompt}</p>
                <p className="text-xs text-gray-400 mb-2.5">Families are asked: &ldquo;{c.clientPrompt}&rdquo;</p>
                <CriterionPicker
                  criterion={c}
                  selected={currentCriteriaValues(c, criteria)}
                  onChange={(v) => setCriteria((cur) => ({ ...cur, [c.questionId]: v }))}
                />
              </div>
            ))}
          </div>
        </Card>
      )}
      {fields.length > 0 && (
        <Card
          title={`${listing.label}: details`}
          onSave={() => saveListingAction(listing.id, { fields: Object.fromEntries(fields.map((f) => [f.key, values[f.key]])) })}
        >
          <DetailsFields schema={fields} values={values} onChange={setValues} />
        </Card>
      )}
    </>
  );
}

function Card({ title, subtitle, children, onSave, onSaved, valid = true }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onSave: () => Promise<Result>;
  onSaved?: () => void;
  valid?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    const r = await onSave();
    setSaving(false);
    setMsg(r.ok ? { ok: true, text: "Saved" } : { ok: false, text: r.error });
    if (r.ok) {
      onSaved?.();
      setTimeout(() => setMsg(null), 3000);
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      <div className="mt-4">{children}</div>
      <div className="flex items-center gap-3 mt-5">
        <button
          type="button"
          onClick={save}
          disabled={saving || !valid}
          className="h-11 px-5 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {!valid && !msg && <span className="text-xs text-gray-400">Fill in the required parts to save.</span>}
        {msg && <span className={cn("text-sm", msg.ok ? "text-forest-600" : "text-red-600")}>{msg.text}</span>}
      </div>
    </section>
  );
}

function CategoryChangeRequest({ current }: { current: string[] }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    setSending(true);
    const r = await requestCategoryChangeAction(message);
    setSending(false);
    if (r.ok) {
      setResult({ ok: true, text: "Sent. Our team will follow up with you." });
      setMessage("");
      setOpen(false);
    } else {
      setResult({ ok: false, text: r.error });
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5">
      <h2 className="text-base font-bold text-gray-900">Your categories</h2>
      <div className="flex flex-wrap gap-2 mt-3">
        {current.map((l) => (
          <span key={l} className="px-3 py-1.5 rounded-full bg-forest-50 text-forest-700 text-sm font-medium border border-forest-100">{l}</span>
        ))}
      </div>
      {open ? (
        <div className="mt-4">
          <textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Which categories would you like to add or remove?"
            className="w-full px-4 py-3 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-forest-400 placeholder:text-gray-400 resize-none"
          />
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={send} disabled={sending || !message.trim()} className="h-11 px-5 rounded-xl bg-forest-600 text-white text-sm font-semibold disabled:opacity-40">
              {sending ? "Sending…" : "Send request"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="h-11 px-4 rounded-xl text-sm text-gray-500">Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => { setOpen(true); setResult(null); }} className="mt-3 text-sm font-medium text-forest-600 min-h-[44px]">
          Request a category change
        </button>
      )}
      {result && <p className={cn("text-sm mt-2", result.ok ? "text-forest-600" : "text-red-600")}>{result.text}</p>}
      <p className="text-xs text-gray-400 mt-1">Category changes are reviewed by our team.</p>
    </section>
  );
}
