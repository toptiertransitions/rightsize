"use client";

import { useState } from "react";
import type {
  MarketplacePartner,
  MarketplaceCategory,
  MarketplaceListing,
  MarketplaceReferralTermsAuditEntry,
  MarketplaceIntroductionEvent,
  MarketplaceDeliveryMode,
} from "@/lib/marketplace/types";
import {
  updatePartnerOverviewAction,
  updatePartnerServiceAreaAction,
  updateListingAttributesAction,
  moveListingStatusAction,
  updateReferralTermsAction,
  updateListingIntroNotificationAction,
  invitePartnerToPortalAction,
} from "../../actions";
import { FieldInput } from "../../FieldInput";

interface LegacyReview { score: number; comment: string; date: string }

interface Props {
  partner: MarketplacePartner;
  categories: MarketplaceCategory[];
  listings: MarketplaceListing[];
  auditLogs: MarketplaceReferralTermsAuditEntry[];
  introEvents: MarketplaceIntroductionEvent[];
  legacyPortalLinked: boolean;
  legacyReviews: LegacyReview[];
  canEditReferralTerms: boolean;
  canViewReferralAuditLog: boolean;
}

type Tab = "overview" | "listings" | "service-area" | "referral-terms" | "reviews" | "activity" | "portal";

export function PartnerDetailClient(props: Props) {
  const { partner, categories, listings, auditLogs, introEvents, legacyPortalLinked, legacyReviews, canEditReferralTerms, canViewReferralAuditLog } = props;
  const [tab, setTab] = useState<Tab>("overview");

  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "listings", label: "Listings" },
    { key: "service-area", label: "Service Area" },
    ...(canEditReferralTerms ? [{ key: "referral-terms" as Tab, label: "Referral Terms" }] : []),
    { key: "reviews", label: "Reviews and Projects" },
    { key: "activity", label: "Activity" },
    { key: "portal", label: "Portal Access" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">{partner.companyName}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{partner.lifecycleStatus} · {partner.source}{partner.localVendorId ? " · migrated from Disposition Network" : ""}</p>
      </div>

      <div className="flex items-center gap-1 border-b border-gray-800 mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === t.key ? "border-forest-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab partner={partner} />}
      {tab === "listings" && <ListingsTab partner={partner} categories={categories} listings={listings} categoryById={categoryById} />}
      {tab === "service-area" && <ServiceAreaTab partner={partner} />}
      {tab === "referral-terms" && canEditReferralTerms && (
        <ReferralTermsTab listings={listings} categoryById={categoryById} />
      )}
      {tab === "reviews" && <ReviewsTab legacyReviews={legacyReviews} hasLegacyLink={Boolean(partner.localVendorId)} />}
      {tab === "activity" && (
        <ActivityTab auditLogs={auditLogs} introEvents={introEvents} partner={partner} canViewReferralAuditLog={canViewReferralAuditLog} />
      )}
      {tab === "portal" && <PortalAccessTab partner={partner} legacyPortalLinked={legacyPortalLinked} />}
    </div>
  );
}

// ─── Overview ──────────────────────────────────────────────────────────────

function OverviewTab({ partner }: { partner: MarketplacePartner }) {
  const [form, setForm] = useState({
    companyName: partner.companyName,
    pocName: partner.pocName,
    email: partner.email,
    phone: partner.phone,
    website: partner.website,
    address: partner.address,
    city: partner.city,
    state: partner.state,
    zip: partner.zip,
    deliveryMode: partner.deliveryMode,
    logo: partner.logo,
    shortBio: partner.shortBio,
    aboutUs: partner.aboutUs,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // CRM is the source of truth for these once linked — see
  // syncPartnerFromCrmIfLinked. Editable only in the CRM tab from here on,
  // so a stray edit here can never fight with the next sync.
  const crmManaged = Boolean(partner.crmReferralCompanyId);

  async function save() {
    setSaving(true);
    setMsg("");
    const payload = crmManaged
      ? { deliveryMode: form.deliveryMode, logo: form.logo, shortBio: form.shortBio, aboutUs: form.aboutUs }
      : form;
    const result = await updatePartnerOverviewAction(partner.id, payload);
    setSaving(false);
    setMsg(result.ok ? "Saved." : result.error);
  }

  const inputCls = "h-10 px-3 rounded-xl border border-gray-700 bg-gray-900 text-sm text-white w-full focus:outline-none focus:ring-2 focus:ring-forest-500/30";
  const disabledCls = "h-10 px-3 rounded-xl border border-gray-800 bg-gray-900/40 text-sm text-gray-500 w-full cursor-not-allowed";
  const labelCls = "block text-xs font-medium text-gray-400 mb-1.5";

  return (
    <div className="max-w-2xl space-y-4">
      {crmManaged && (
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl px-4 py-3 text-xs text-gray-400">
          Company name, contact info, and address are managed in the <a href="/admin/crm" className="text-forest-400 hover:underline">CRM</a> for this linked partner — edit them there; they'll sync here automatically.
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div><label className={labelCls}>Company Name</label><input disabled={crmManaged} className={crmManaged ? disabledCls : inputCls} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></div>
        <div><label className={labelCls}>Point of Contact</label><input disabled={crmManaged} className={crmManaged ? disabledCls : inputCls} value={form.pocName} onChange={(e) => setForm({ ...form, pocName: e.target.value })} /></div>
        <div><label className={labelCls}>Email</label><input disabled={crmManaged} className={crmManaged ? disabledCls : inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><label className={labelCls}>Phone</label><input disabled={crmManaged} className={crmManaged ? disabledCls : inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div><label className={labelCls}>Website</label><input disabled={crmManaged} className={crmManaged ? disabledCls : inputCls} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
        <div>
          <label className={labelCls}>Delivery Mode</label>
          <select className={inputCls} value={form.deliveryMode} onChange={(e) => setForm({ ...form, deliveryMode: e.target.value as MarketplaceDeliveryMode })}>
            <option value="In-person">In-person</option>
            <option value="Virtual">Virtual</option>
            <option value="Both">Both</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div><label className={labelCls}>Address</label><input disabled={crmManaged} className={crmManaged ? disabledCls : inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div><label className={labelCls}>City</label><input disabled={crmManaged} className={crmManaged ? disabledCls : inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={labelCls}>State</label><input disabled={crmManaged} className={crmManaged ? disabledCls : inputCls} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
          <div><label className={labelCls}>Zip</label><input disabled={crmManaged} className={crmManaged ? disabledCls : inputCls} value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} /></div>
        </div>
      </div>
      <div><label className={labelCls}>Logo URL</label><input className={inputCls} value={form.logo} onChange={(e) => setForm({ ...form, logo: e.target.value })} /></div>
      <div><label className={labelCls}>Short Bio (card, ~160 chars)</label><input className={inputCls} value={form.shortBio} onChange={(e) => setForm({ ...form, shortBio: e.target.value })} /></div>
      <div><label className={labelCls}>About Us</label><textarea className={inputCls} rows={4} value={form.aboutUs} onChange={(e) => setForm({ ...form, aboutUs: e.target.value })} /></div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="h-9 px-4 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
        {msg && <span className="text-xs text-gray-500">{msg}</span>}
      </div>
    </div>
  );
}

// ─── Listings ──────────────────────────────────────────────────────────────

function ListingsTab({
  listings,
  categoryById,
}: {
  partner: MarketplacePartner;
  categories: MarketplaceCategory[];
  listings: MarketplaceListing[];
  categoryById: Map<string, MarketplaceCategory>;
}) {
  if (listings.length === 0) return <p className="text-sm text-gray-500">No listings yet.</p>;
  return (
    <div className="space-y-8 max-w-2xl">
      {listings.map((listing) => {
        const category = categoryById.get(listing.categoryId);
        if (!category) return null;
        return <ListingEditor key={listing.id} listing={listing} category={category} />;
      })}
    </div>
  );
}

function ListingEditor({ listing, category }: { listing: MarketplaceListing; category: MarketplaceCategory }) {
  const [attributes, setAttributes] = useState<Record<string, unknown>>(listing.attributes);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [moving, setMoving] = useState(false);
  const [blockReason, setBlockReason] = useState("");

  async function save() {
    setSaving(true);
    setMsg("");
    const result = await updateListingAttributesAction(listing.id, attributes);
    setSaving(false);
    setMsg(result.ok ? "Saved." : result.error);
  }

  async function moveToLive() {
    setMoving(true);
    setBlockReason("");
    const result = await moveListingStatusAction(listing.id, listing.categoryId, "Live", attributes);
    setMoving(false);
    if (!result.ok) setBlockReason(result.error);
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">{category.label}</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full ${listing.status === "Live" ? "bg-green-900/40 text-green-300" : "bg-gray-800 text-gray-400"}`}>
          {listing.status}
        </span>
      </div>
      <div className="space-y-3">
        {category.fieldSchema.map((field) => (
          <div key={field.key}>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              {field.label}{field.required && <span className="text-red-400"> *</span>}
            </label>
            <FieldInput field={field} value={attributes[field.key]} onChange={(v) => setAttributes({ ...attributes, [field.key]: v })} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button onClick={save} disabled={saving} className="h-9 px-4 rounded-lg bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 disabled:opacity-50">
          {saving ? "Saving…" : "Save Attributes"}
        </button>
        {listing.status !== "Live" && (
          <button onClick={moveToLive} disabled={moving} className="h-9 px-4 rounded-lg border border-gray-600 text-gray-300 text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
            {moving ? "Checking…" : "Move to Live"}
          </button>
        )}
        {msg && <span className="text-xs text-gray-500">{msg}</span>}
      </div>
      {blockReason && <p className="text-xs text-amber-400 mt-2">{blockReason}</p>}
    </div>
  );
}

// ─── Service Area ──────────────────────────────────────────────────────────
// Simple structured editor for now (comma-separated zip entry + statewide/
// nationwide toggles) rather than the full Leaflet county-picker the spec
// envisions — that map component is a substantial lift on its own and isn't
// needed to unblock the rest of Phase 3; flagged as a deliberate fast-follow.

function ServiceAreaTab({ partner }: { partner: MarketplacePartner }) {
  const [zipsText, setZipsText] = useState(partner.serviceArea.zips.join(", "));
  const [statewide, setStatewide] = useState(partner.serviceArea.statewide);
  const [nationwide, setNationwide] = useState(partner.serviceArea.nationwide);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setSaving(true);
    setMsg("");
    const zips = zipsText.split(/[,\s]+/).map((z) => z.trim()).filter(Boolean);
    const result = await updatePartnerServiceAreaAction(partner.id, { zips, counties: partner.serviceArea.counties, statewide, nationwide });
    setSaving(false);
    setMsg(result.ok ? "Saved." : result.error);
  }

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-xs text-gray-500">
        Full map-based county picker is a planned fast-follow — for now, zips are entered directly.
      </p>
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5">Zip Codes Served (comma-separated)</label>
        <textarea
          value={zipsText}
          onChange={(e) => setZipsText(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 rounded-xl border border-gray-700 bg-gray-900 text-sm text-white focus:outline-none focus:ring-2 focus:ring-forest-500/30"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input type="checkbox" checked={statewide} onChange={(e) => setStatewide(e.target.checked)} />
        Serves the entire state (only applies when Delivery Mode is Virtual or Both)
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input type="checkbox" checked={nationwide} onChange={(e) => setNationwide(e.target.checked)} />
        Serves nationwide (only applies when Delivery Mode is Virtual or Both)
      </label>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="h-9 px-4 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
        {msg && <span className="text-xs text-gray-500">{msg}</span>}
      </div>
    </div>
  );
}

// ─── Referral Terms (internal only) ─────────────────────────────────────────

function ReferralTermsTab({
  listings,
  categoryById,
}: {
  listings: MarketplaceListing[];
  categoryById: Map<string, MarketplaceCategory>;
}) {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-amber-900/20 border border-amber-800/50 rounded-xl px-4 py-3 text-xs text-amber-300">
        Internal only — never shown to the partner or on any public page.
      </div>
      {listings.map((listing) => {
        const category = categoryById.get(listing.categoryId);
        if (!category) return null;
        return <ReferralTermsEditor key={listing.id} listing={listing} category={category} />;
      })}
    </div>
  );
}

function ReferralTermsEditor({ listing, category }: { listing: MarketplaceListing; category: MarketplaceCategory }) {
  const [feeType, setFeeType] = useState(listing.feeType);
  const [feeValue, setFeeValue] = useState(String(listing.feeValue));
  const [creditPct, setCreditPct] = useState(String(listing.creditToSeniorPercent));
  const [notes, setNotes] = useState(listing.referralNotes);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [notifyMethod, setNotifyMethod] = useState(listing.introNotificationMethod);
  const [notifyValue, setNotifyValue] = useState(listing.introNotificationValue);
  const [notifySaving, setNotifySaving] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState("");

  async function saveNotification() {
    setNotifySaving(true);
    setNotifyMsg("");
    const result = await updateListingIntroNotificationAction(listing.id, notifyMethod, notifyValue);
    setNotifySaving(false);
    setNotifyMsg(result.ok ? "Saved." : result.error);
  }

  const needsConfirm = !category.referralPolicy.feesAllowed && feeType !== "none";

  async function save() {
    setSaving(true);
    setMsg("");
    const result = await updateReferralTermsAction(
      listing.id,
      { feeType, feeValue: Number(feeValue) || 0, creditToSeniorPercent: Number(creditPct) || 0, referralNotes: notes },
      confirmed,
      category.referralPolicy.feesAllowed
    );
    setSaving(false);
    setMsg(result.ok ? "Saved." : result.error);
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-4">{category.label}</h3>
      {needsConfirm && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-lg px-3 py-2.5 text-xs text-red-300 mb-4">
          Referral fees in this category are restricted by law or professional rules. Confirm with counsel before enabling.
          <label className="flex items-center gap-2 mt-2 text-red-200">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I've confirmed with counsel that this is allowed.
          </label>
        </div>
      )}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Fee Type</label>
          <select value={feeType} onChange={(e) => setFeeType(e.target.value as typeof feeType)} className="h-9 px-3 rounded-lg border border-gray-700 bg-gray-950 text-sm text-white w-full">
            <option value="none">None</option>
            <option value="percent">Percent</option>
            <option value="flat">Flat</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Fee Value</label>
          <input type="number" value={feeValue} onChange={(e) => setFeeValue(e.target.value)} className="h-9 px-3 rounded-lg border border-gray-700 bg-gray-950 text-sm text-white w-full" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Credit to Senior %</label>
          <input type="number" value={creditPct} onChange={(e) => setCreditPct(e.target.value)} disabled={!category.referralPolicy.creditToSeniorAllowed} className="h-9 px-3 rounded-lg border border-gray-700 bg-gray-950 text-sm text-white w-full disabled:opacity-40" />
        </div>
      </div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">Notes</label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-950 text-sm text-white mb-3" />
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="h-9 px-4 rounded-lg bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
        {msg && <span className="text-xs text-gray-500">{msg}</span>}
      </div>

      <div className="border-t border-gray-800 mt-4 pt-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Introduction Routing</p>
        <p className="text-xs text-gray-500 mb-3">
          Defaults to TTTAdmin for every listing — no automated email goes to a partner or client until this is switched.
        </p>
        <div className="flex items-center gap-3 mb-2">
          <select
            value={notifyMethod}
            onChange={(e) => setNotifyMethod(e.target.value as typeof notifyMethod)}
            className="h-9 px-3 rounded-lg border border-gray-700 bg-gray-950 text-sm text-white"
          >
            <option value="TTTAdmin">TTT Admins (default)</option>
            <option value="PartnerEmail">Partner's Email</option>
            <option value="CustomURL">Custom URL</option>
          </select>
          {notifyMethod === "CustomURL" && (
            <input
              type="url"
              placeholder="https://..."
              value={notifyValue}
              onChange={(e) => setNotifyValue(e.target.value)}
              className="h-9 px-3 rounded-lg border border-gray-700 bg-gray-950 text-sm text-white flex-1"
            />
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={saveNotification} disabled={notifySaving} className="h-9 px-4 rounded-lg border border-gray-600 text-gray-300 text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
            {notifySaving ? "Saving…" : "Save Routing"}
          </button>
          {notifyMsg && <span className="text-xs text-gray-500">{notifyMsg}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Reviews and Projects ────────────────────────────────────────────────────

function ReviewsTab({ legacyReviews, hasLegacyLink }: { legacyReviews: LegacyReview[]; hasLegacyLink: boolean }) {
  if (!hasLegacyLink) {
    return <p className="text-sm text-gray-500">No reviews yet — review collection isn't built into the new marketplace model yet (Phase 5).</p>;
  }
  if (legacyReviews.length === 0) {
    return <p className="text-sm text-gray-500">No reviews on file for this partner's linked Disposition Network record.</p>;
  }
  return (
    <div className="max-w-2xl space-y-2">
      <p className="text-xs text-gray-500 mb-3">Read-only — from this partner's linked Disposition Network record. Reviews are entered directly in Airtable; there's no submission flow in either model yet.</p>
      {legacyReviews.map((r, i) => (
        <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-200">{"★".repeat(r.score)}{"☆".repeat(5 - r.score)}</span>
            <span className="text-xs text-gray-500">{r.date}</span>
          </div>
          {r.comment && <p className="text-sm text-gray-400 mt-1">{r.comment}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── Activity ──────────────────────────────────────────────────────────────

function ActivityTab({
  auditLogs,
  introEvents,
  partner,
  canViewReferralAuditLog,
}: {
  auditLogs: MarketplaceReferralTermsAuditEntry[];
  introEvents: MarketplaceIntroductionEvent[];
  partner: MarketplacePartner;
  canViewReferralAuditLog: boolean;
}) {
  return (
    <div className="max-w-2xl space-y-8">
      {partner.crmReferralCompanyId && (
        <p className="text-sm text-gray-400">
          Also a CRM referral partner — see <a href="/admin/partners" className="text-forest-400 hover:underline">CRM &rarr; Partners</a>.
        </p>
      )}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Introduction Events</h3>
        {introEvents.length === 0 ? (
          <p className="text-sm text-gray-500">None yet — the tracked-link introduction flow ships in Phase 5.</p>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800/60">
            {introEvents.map((e) => (
              <div key={e.id} className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-gray-200">{e.clientName || "(no name)"}</span>
                <span className="text-xs text-gray-500">{e.status} · {new Date(e.requestedAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {canViewReferralAuditLog && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Referral Terms Audit Log</h3>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-gray-500">No referral terms changes yet.</p>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800/60">
              {auditLogs.map((a) => (
                <div key={a.id} className="px-4 py-3">
                  <p className="text-sm text-gray-200">{a.fieldChanged}: <span className="text-gray-500">{a.oldValue || "(empty)"}</span> &rarr; <span className="text-gray-300">{a.newValue}</span></p>
                  <p className="text-xs text-gray-500 mt-0.5">{new Date(a.changedAt).toLocaleString()}{a.confirmedRestrictedCategory ? " · counsel-confirmed restricted category" : ""}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Portal Access ───────────────────────────────────────────────────────────

function PortalAccessTab({ partner, legacyPortalLinked }: { partner: MarketplacePartner; legacyPortalLinked: boolean }) {
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState("");

  async function invite() {
    setInviting(true);
    setMsg("");
    const result = await invitePartnerToPortalAction(partner.id);
    setInviting(false);
    setMsg(result.ok ? "Invite sent." : result.error);
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-200">Referral Partner Portal</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {partner.crmReferralContactId
                ? "Invited — can log in to see referred projects' calendar and files."
                : "Not invited yet. There's no self-service way to join — only staff can invite a partner here."}
            </p>
          </div>
          {!partner.crmReferralContactId && (
            <button
              onClick={invite}
              disabled={inviting || !partner.email}
              title={!partner.email ? "Add an email in Overview first" : undefined}
              className="h-9 px-4 rounded-lg bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 disabled:opacity-50 whitespace-nowrap"
            >
              {inviting ? "Sending…" : "Invite to Partner Portal"}
            </button>
          )}
        </div>
        {msg && <p className="text-xs text-gray-500 mt-2">{msg}</p>}
      </div>

      {partner.crmReferralCompanyId && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
          <p className="text-sm text-gray-200">Linked CRM referral company</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Projects referred to this partner (including from the marketplace) show up in their portal calendar through this link.
          </p>
        </div>
      )}
      {partner.localVendorId && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
          <p className="text-sm text-gray-200">Linked Disposition Network vendor</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {legacyPortalLinked ? "This vendor also has an active disposition-side portal login." : "No disposition-side portal login set up yet."}
          </p>
        </div>
      )}
    </div>
  );
}
