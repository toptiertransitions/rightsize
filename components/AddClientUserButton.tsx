"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { PARTNER_CATEGORIES, type PartnerCategory } from "@/lib/types";
import { getInviteReferralContextAction, type InviteReferralContext } from "@/app/(protected)/partners/referralActions";
import { matchesQuery, type ReferralAttachment, type ReferralPartnerOption } from "@/lib/partners/referralShared";
import { PartnerLogo } from "@/components/partners/PartnerLogo";

interface Props {
  tenantId: string;
  projectName: string;
}

type Step = "ask" | "referral" | "email";

const REFERRAL_CATEGORIES = PARTNER_CATEGORIES.filter((c) => c !== "Move Manager");

export function AddClientUserButton({ tenantId, projectName }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("ask");
  const [referral, setReferral] = useState<ReferralAttachment | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; error?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          role: "Owner",
          email: email.trim(),
          type: "client",
          ...(referral ? { referral } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error ?? "Failed to send invite" });
      } else {
        setResult({ success: true });
        setEmail("");
      }
    } catch {
      setResult({ error: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setStep("ask");
    setReferral(null);
    setEmail("");
    setResult(null);
  };

  // "Invite another" keeps the referral that was just attached — it's
  // already saved on the project — and goes straight to the email field.
  const handleInviteAnother = () => {
    setResult(null);
    setReferral(null);
    setStep("email");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-forest-600 text-white text-sm font-medium rounded-lg hover:bg-forest-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
        Add Client User
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={handleClose}>
          <div
            className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Add Client User</h2>
                <p className="text-sm text-gray-500 mt-0.5">{projectName}</p>
              </div>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {result?.success ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-forest-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-gray-900 font-semibold mb-1">Invite sent!</p>
                <p className="text-sm text-gray-500 mb-4">
                  They&apos;ll receive an email to access their project.
                  {referral && <> {referral.name || referral.contactName} is set as their {referral.category}.</>}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleInviteAnother}
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Invite another
                  </button>
                  <button
                    onClick={handleClose}
                    className="flex-1 px-4 py-2 bg-forest-600 text-white rounded-lg text-sm font-medium hover:bg-forest-700 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : step === "ask" ? (
              <div>
                <div className="w-11 h-11 rounded-xl bg-forest-50 text-forest-600 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-gray-900">Attach the Referral Partner?</h3>
                <p className="text-sm text-gray-500 mt-1 mb-5 leading-relaxed">
                  If a partner referred this client, they&rsquo;ll be set as the client&rsquo;s partner for that category, and other marketplace options in that category will be hidden.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setStep("email")}
                    className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    No
                  </button>
                  <button
                    onClick={() => setStep("referral")}
                    className="px-4 py-2.5 bg-forest-600 text-white rounded-xl text-sm font-semibold hover:bg-forest-700 transition-colors"
                  >
                    Yes
                  </button>
                </div>
              </div>
            ) : step === "referral" ? (
              <ReferralPicker
                tenantId={tenantId}
                onBack={() => setStep("ask")}
                onConfirm={(r) => {
                  setReferral(r);
                  setStep("email");
                }}
              />
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {referral && (
                  <div className="flex items-center gap-3 rounded-xl border border-forest-200 bg-forest-50/60 px-3.5 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-forest-700">Referral partner · {referral.category}</p>
                      <p className="text-sm font-semibold text-gray-900 truncate">{referral.name || referral.contactName}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep("referral")}
                      className="text-xs font-medium text-forest-700 hover:text-forest-900 hover:underline"
                    >
                      Change
                    </button>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="client@example.com"
                    required
                    autoFocus
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
                  />
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  They&apos;ll receive a welcome email with a link to access their project as an Owner.
                </p>
                {result?.error && (
                  <p className="text-sm text-red-600">{result.error}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !email.trim()}
                    className="flex-1 px-4 py-2 bg-forest-600 text-white rounded-lg text-sm font-medium hover:bg-forest-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "Sending…" : "Send Invite"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Referral picker ──────────────────────────────────────────────────────────
// Leads with the partner on the project's CRM opportunity (when there is
// one) for a one-tap confirm; "Choose a different partner" switches to an
// autocomplete search across every live marketplace listing.

function ReferralPicker({ tenantId, onBack, onConfirm }: {
  tenantId: string;
  onBack: () => void;
  onConfirm: (r: ReferralAttachment) => void;
}) {
  const [ctx, setCtx] = useState<InviteReferralContext | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"crm" | "search">("crm");

  useEffect(() => {
    let cancelled = false;
    getInviteReferralContextAction(tenantId).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCtx(res.data);
      if (!res.data.crm) setMode("search");
    });
    return () => { cancelled = true; };
  }, [tenantId]);

  if (error) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700">&larr; Back</button>
      </div>
    );
  }

  if (!ctx) {
    return (
      <div className="flex items-center justify-center gap-2.5 py-10 text-sm text-gray-500">
        <svg className="animate-spin h-4 w-4 text-forest-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Looking up the referral partner…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900">
          {mode === "crm" ? "Confirm the referral partner" : "Find a partner"}
        </h3>
        <p className="text-sm text-gray-500 mt-0.5">
          {mode === "crm" ? "From the CRM opportunity linked to this project." : "Search every partner in the marketplace."}
        </p>
      </div>

      {ctx.existing.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-800 leading-relaxed">
          Already set on this project: {ctx.existing.map((e) => `${e.name} (${e.category})`).join(", ")}. Attaching a partner in the same category replaces it.
        </div>
      )}

      {mode === "crm" && ctx.crm ? (
        <CrmConfirm crm={ctx.crm} onConfirm={onConfirm} onSearch={() => setMode("search")} />
      ) : (
        <PartnerSearch options={ctx.options} onConfirm={onConfirm} />
      )}

      <div className="flex items-center justify-between pt-1">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700">&larr; Back</button>
        {mode === "search" && ctx.crm && (
          <button onClick={() => setMode("crm")} className="text-sm font-medium text-forest-700 hover:underline">
            Use CRM partner
          </button>
        )}
      </div>
    </div>
  );
}

function CrmConfirm({ crm, onConfirm, onSearch }: {
  crm: NonNullable<InviteReferralContext["crm"]>;
  onConfirm: (r: ReferralAttachment) => void;
  onSearch: () => void;
}) {
  const [listingId, setListingId] = useState(crm.marketplaceMatches.find((m) => m.category === crm.suggestedCategory)?.partnerId ?? crm.marketplaceMatches[0]?.partnerId ?? "");
  const [category, setCategory] = useState<PartnerCategory | "">(crm.suggestedCategory ?? "");
  const listing = crm.marketplaceMatches.find((m) => m.partnerId === listingId);
  const effectiveCategory = listing?.category ?? category;

  const confirm = () => {
    if (!effectiveCategory) return;
    onConfirm({
      category: effectiveCategory,
      partnerId: listing?.partnerId,
      name: listing?.name ?? crm.companyName,
      contactName: crm.contactName,
      phone: crm.contactPhone,
      email: crm.contactEmail,
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Company</p>
        <p className="text-[15px] font-semibold text-gray-900">{crm.companyName || "—"}</p>
        {crm.companyType && <p className="text-xs text-gray-500 mt-0.5">{crm.companyType}</p>}
        <div className="h-px bg-gray-100 my-3" />
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Contact</p>
        <p className="text-sm font-medium text-gray-900">{crm.contactName}</p>
        {(crm.contactEmail || crm.contactPhone) && (
          <p className="text-xs text-gray-500 mt-0.5">{[crm.contactEmail, crm.contactPhone].filter(Boolean).join(" · ")}</p>
        )}
      </div>

      {crm.marketplaceMatches.length > 1 && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Marketplace listing</label>
          <select
            value={listingId}
            onChange={(e) => setListingId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
          >
            {crm.marketplaceMatches.map((m) => (
              <option key={`${m.partnerId}-${m.category}`} value={m.partnerId}>{m.name} — {m.category}</option>
            ))}
          </select>
        </div>
      )}

      {crm.marketplaceMatches.length === 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Partner category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as PartnerCategory)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
          >
            <option value="">Select a category…</option>
            {REFERRAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1.5">Not listed in the marketplace yet — the client will still see them as their partner.</p>
        </div>
      )}

      {listing && crm.marketplaceMatches.length === 1 && (
        <p className="text-xs text-forest-700 font-medium">Marketplace listing: {listing.name} · {listing.category}</p>
      )}

      <div className="flex flex-col gap-2">
        <button
          onClick={confirm}
          disabled={!effectiveCategory}
          className="w-full px-4 py-2.5 bg-forest-600 text-white rounded-xl text-sm font-semibold hover:bg-forest-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Confirm partner
        </button>
        <button
          onClick={onSearch}
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Choose a different partner
        </button>
      </div>
    </div>
  );
}

function PartnerSearch({ options, onConfirm }: {
  options: ReferralPartnerOption[];
  onConfirm: (r: ReferralAttachment) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReferralPartnerOption | null>(null);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => options.filter((o) => matchesQuery(`${o.name} ${o.category} ${o.city}`, query)).slice(0, 8),
    [options, query]
  );

  useEffect(() => { setHighlight(0); }, [query]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const pick = (o: ReferralPartnerOption) => {
    setSelected(o);
    setQuery(o.name);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (selected) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && results[highlight]) { e.preventDefault(); pick(results[highlight]); }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <svg className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
          onKeyDown={onKeyDown}
          placeholder="Start typing a partner name…"
          role="combobox"
          aria-expanded={!selected && results.length > 0}
          aria-controls="referral-partner-results"
          className="w-full h-11 pl-9 pr-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
        />
      </div>

      {!selected && (
        <ul id="referral-partner-results" role="listbox" className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden max-h-72 overflow-y-auto">
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-400">No partners match &ldquo;{query}&rdquo;.</li>
          ) : (
            results.map((o, i) => (
              <li key={`${o.partnerId}-${o.category}`} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  onClick={() => pick(o)}
                  onMouseEnter={() => setHighlight(i)}
                  className={`w-full flex items-center gap-3 text-left px-3.5 py-2.5 transition-colors ${i === highlight ? "bg-forest-50/70" : "bg-white"}`}
                >
                  <PartnerLogo logo={o.logo} name={o.name} size="tray" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900 truncate">{o.name}</span>
                    <span className="block text-xs text-gray-500 truncate">
                      {o.category}{o.city ? ` · ${o.city}${o.state ? `, ${o.state}` : ""}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      {selected && (
        <div className="flex items-center gap-3 rounded-2xl border border-forest-300 ring-1 ring-forest-200 bg-white p-3.5">
          <PartnerLogo logo={selected.logo} name={selected.name} size="tray" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 truncate">{selected.name}</p>
            <p className="text-xs text-gray-500">{selected.category}</p>
          </div>
          <button
            type="button"
            onClick={() => { setSelected(null); setQuery(""); inputRef.current?.focus(); }}
            className="text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        </div>
      )}

      <button
        onClick={() => selected && onConfirm({ category: selected.category, partnerId: selected.partnerId, name: selected.name })}
        disabled={!selected}
        className="w-full px-4 py-2.5 bg-forest-600 text-white rounded-xl text-sm font-semibold hover:bg-forest-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Attach partner
      </button>
    </div>
  );
}
