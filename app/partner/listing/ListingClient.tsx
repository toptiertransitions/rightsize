"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { getPartnerCriteria, readMatchCriteria, currentCriteriaValues, type MatchCriteria } from "@/lib/partners/criteria";
import type { PartnerCategory } from "@/lib/types";
import type { MarketplaceFieldDef, MarketplaceLifecycleStatus, MarketplaceListingStatus } from "@/lib/marketplace/types";
import {
  BusinessFields, AboutFields, AreaFields, CriterionPicker, DetailsFields,
  businessValid, areaValid, parseZipText, editableFields, areaSaveInput,
  type BusinessData, type AboutData, type AreaData,
} from "../setup/SetupFields";
import { inPersonOnly, partnerCategoryLabel } from "@/lib/marketplace/partnerScreens";
import { SearchCombobox } from "@/components/ui/SearchCombobox";
import { saveBusinessAction, saveAboutAction, saveServiceAreaAction, saveListingAction, requestCategoryChangeAction, submitSetupAction, addCategoryAction, submitCategoryAction } from "../setup/actions";

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
  "Waiting on Partner": { text: "We asked for a few updates. Make the changes below, then resubmit for review.", cls: "bg-sky-50 border-sky-200 text-sky-900" },
  Rejected: { text: "Your profile wasn't approved for the partner network. Questions? Reply to our email.", cls: "bg-gray-50 border-gray-200 text-gray-700" },
};

export function ListingClient({ status, reviewFeedback, business: b0, about: a0, area: ar0, listings, addableCategories }: {
  status: MarketplaceLifecycleStatus;
  /** Our latest review note, shown while changes are requested */
  reviewFeedback?: string;
  business: BusinessData;
  about: AboutData;
  area: AreaData;
  listings: ListingData[];
  /** Categories this partner isn't in yet, for "Add a category" */
  addableCategories: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [business, setBusiness] = useState(b0);
  const [about, setAbout] = useState(a0);
  const [area, setArea] = useState(ar0);
  const banner = STATUS_COPY[status];
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitError, setResubmitError] = useState("");

  async function resubmit() {
    setResubmitting(true);
    setResubmitError("");
    const res = await submitSetupAction();
    setResubmitting(false);
    if (!res.ok) setResubmitError(res.error);
    else router.refresh();
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">My Listing</h1>
      <p className="text-sm text-gray-500 mt-1">What families see, and who we match you with. Changes save to your listing right away.</p>

      {banner && (
        <div className={cn("mt-5 rounded-xl border px-4 py-3 text-sm", banner.cls)}>
          <p>{banner.text}</p>
          {status === "Waiting on Partner" && (
            <>
              {reviewFeedback && (
                <div className="mt-3 rounded-lg bg-white/70 border border-sky-100 px-3 py-2 text-gray-700 whitespace-pre-line">{reviewFeedback}</div>
              )}
              <button
                type="button"
                onClick={resubmit}
                disabled={resubmitting}
                className="mt-3 inline-flex items-center justify-center h-10 px-4 rounded-xl bg-forest-600 hover:bg-forest-700 text-white font-semibold disabled:opacity-60"
              >
                {resubmitting ? "Resubmitting…" : "Resubmit for review"}
              </button>
              {resubmitError && <p className="mt-2 text-red-600">{resubmitError}</p>}
            </>
          )}
        </div>
      )}

      <div className="mt-6 space-y-5">
        <Card title="Business" valid={businessValid(business)} onSave={() => saveBusinessAction(business)} onSaved={() => router.refresh()}>
          <BusinessFields data={business} onChange={setBusiness} realtor={listings.length > 0 && listings.every((l) => l.label === "Realtor")} />
        </Card>
        <Card title="About" onSave={() => saveAboutAction(about)}>
          <AboutFields data={about} onChange={setAbout} />
        </Card>
        <Card
          title="Where you work"
          valid={areaValid(area)}
          onSave={() => saveServiceAreaAction(areaSaveInput(area))}
        >
          <AreaFields data={area} onChange={setArea} defaultZip={business.zip} inPersonOnly={inPersonOnly(listings.map((l) => l.label))} />
        </Card>

        {listings.map((l) => <CategoryCards key={l.id} listing={l} partnerStatus={status} />)}

        <CategoriesSection listings={listings} partnerStatus={status} addable={addableCategories} />
      </div>
    </div>
  );
}

// A partner already live elsewhere submits a newly added category on its own
const SUBMIT_PER_CATEGORY: MarketplaceLifecycleStatus[] = ["Live", "Paused"];

function CategoryCards({ listing, partnerStatus }: { listing: ListingData; partnerStatus: MarketplaceLifecycleStatus }) {
  const defs = getPartnerCriteria(listing.label as PartnerCategory);
  const [criteria, setCriteria] = useState<MatchCriteria>(() => readMatchCriteria(listing.attributes));
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...listing.attributes }));
  const fields = editableFields(listing.fieldSchema, listing.label);

  return (
    <>
      {defs.length > 0 && (
        <Card
          title={`${partnerCategoryLabel(listing.label)}: who you serve`}
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
          title={`${partnerCategoryLabel(listing.label)}: details`}
          onSave={() => saveListingAction(listing.id, { fields: Object.fromEntries(fields.map((f) => [f.key, values[f.key]])) })}
        >
          <DetailsFields schema={fields} values={values} onChange={setValues} />
        </Card>
      )}
      {listing.status === "Draft" && SUBMIT_PER_CATEGORY.includes(partnerStatus) && <SubmitCategory listing={listing} />}
      {listing.status === "Submitted" && SUBMIT_PER_CATEGORY.includes(partnerStatus) && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {partnerCategoryLabel(listing.label)} is under review. Your other categories stay live in the meantime.
        </p>
      )}
    </>
  );
}

function SubmitCategory({ listing }: { listing: ListingData }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const label = partnerCategoryLabel(listing.label);

  async function submit() {
    setSending(true);
    setError("");
    const r = await submitCategoryAction(listing.id);
    setSending(false);
    if (!r.ok) setError(r.error);
    else router.refresh();
  }

  return (
    <section className="rounded-2xl border border-forest-200 bg-forest-50 p-5">
      <h2 className="text-base font-bold text-gray-900">Ready to add {label}?</h2>
      <p className="text-sm text-gray-600 mt-1">Save your {label} answers above, then send them to our team. Your other categories stay live while we review.</p>
      <button
        type="button"
        onClick={submit}
        disabled={sending}
        className="mt-4 h-11 px-5 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700 disabled:opacity-40"
      >
        {sending ? "Submitting…" : `Submit ${label} for review`}
      </button>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </section>
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

const LISTING_BADGE: Record<MarketplaceListingStatus, { text: string; cls: string }> = {
  Live: { text: "Live", cls: "bg-forest-50 text-forest-700 border-forest-100" },
  Submitted: { text: "In review", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  Draft: { text: "Needs details", cls: "bg-gray-50 text-gray-600 border-gray-200" },
  Paused: { text: "Paused", cls: "bg-gray-50 text-gray-600 border-gray-200" },
};

const CAN_ADD: MarketplaceLifecycleStatus[] = ["Submitted", "Waiting on Partner", "Live", "Paused"];

function CategoriesSection({ listings, partnerStatus, addable }: {
  listings: ListingData[];
  partnerStatus: MarketplaceLifecycleStatus;
  addable: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  // Several categories only show status chips once there's more than one to compare
  const multi = listings.length > 1;

  async function add() {
    setSaving(true);
    setAddError("");
    const r = await addCategoryAction(categoryId);
    setSaving(false);
    if (!r.ok) return setAddError(r.error);
    setAdding(false);
    setCategoryId("");
    router.refresh();
  }

  async function send() {
    setSending(true);
    const r = await requestCategoryChangeAction(message);
    setSending(false);
    if (r.ok) {
      setResult({ ok: true, text: "Sent. Our team will follow up with you." });
      setMessage("");
      setRequestOpen(false);
    } else {
      setResult({ ok: false, text: r.error });
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5">
      <h2 className="text-base font-bold text-gray-900">Your categories</h2>
      <div className="flex flex-wrap gap-2 mt-3">
        {listings.map((l) => (
          <span key={l.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-forest-50 text-forest-700 text-sm font-medium border border-forest-100">
            {partnerCategoryLabel(l.label)}
            {multi && partnerStatus !== "Submitted" && partnerStatus !== "Waiting on Partner" && (
              <span className={cn("text-[11px] px-1.5 py-0.5 rounded-full border", LISTING_BADGE[l.status].cls)}>{LISTING_BADGE[l.status].text}</span>
            )}
          </span>
        ))}
      </div>

      {CAN_ADD.includes(partnerStatus) && addable.length > 0 && (
        adding ? (
          <div className="mt-4">
            <p className="text-sm text-gray-600 mb-2">Does your business also offer another service? Add it to be listed there too.</p>
            <SearchCombobox
              value={categoryId}
              onChange={setCategoryId}
              options={addable}
              placeholder="Search categories…"
              ariaLabel="Category to add"
              inputClassName="h-11 text-base rounded-xl"
            />
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={add} disabled={saving || !categoryId} className="h-11 px-5 rounded-xl bg-forest-600 text-white text-sm font-semibold disabled:opacity-40">
                {saving ? "Adding…" : "Add category"}
              </button>
              <button type="button" onClick={() => { setAdding(false); setCategoryId(""); setAddError(""); }} className="h-11 px-4 rounded-xl text-sm text-gray-500">Cancel</button>
            </div>
            {addError && <p className="text-sm text-red-600 mt-2">{addError}</p>}
          </div>
        ) : (
          <button type="button" onClick={() => { setAdding(true); setResult(null); }} className="mt-3 text-sm font-medium text-forest-600 min-h-[44px] block">
            + Add a category
          </button>
        )
      )}

      {requestOpen ? (
        <div className="mt-4">
          <textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Which categories would you like to remove or change?"
            className="w-full px-4 py-3 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-forest-400 placeholder:text-gray-400 resize-none"
          />
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={send} disabled={sending || !message.trim()} className="h-11 px-5 rounded-xl bg-forest-600 text-white text-sm font-semibold disabled:opacity-40">
              {sending ? "Sending…" : "Send request"}
            </button>
            <button type="button" onClick={() => setRequestOpen(false)} className="h-11 px-4 rounded-xl text-sm text-gray-500">Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => { setRequestOpen(true); setResult(null); }} className="mt-1 text-sm font-medium text-gray-500 hover:text-forest-600 min-h-[44px]">
          Remove or change a category
        </button>
      )}
      {result && <p className={cn("text-sm mt-2", result.ok ? "text-forest-600" : "text-red-600")}>{result.text}</p>}
      <p className="text-xs text-gray-400 mt-1">New categories are reviewed by our team before they go live.</p>
    </section>
  );
}
