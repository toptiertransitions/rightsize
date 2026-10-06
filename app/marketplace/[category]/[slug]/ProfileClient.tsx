"use client";

import { useState } from "react";
import Link from "next/link";
import { PartnerLogo } from "@/components/partners/PartnerLogo";
import { RatingStars } from "@/components/partners/RatingStars";
import type { MarketplaceDeliveryMode, MarketplaceFieldDef, MarketplaceServiceArea } from "@/lib/marketplace/types";
import { createPublicIntroductionRequestAction } from "../../actions";

interface Partner {
  slug: string;
  companyName: string;
  logo: string;
  aboutUs: string;
  shortBio: string;
  city: string;
  state: string;
  website: string;
  deliveryMode: MarketplaceDeliveryMode;
  serviceArea: MarketplaceServiceArea;
  languages: string[];
  seniorSpecialty: string[];
  priceTier: string;
}

interface Props {
  categoryLabel: string;
  categorySlug: string;
  disclosureText: string;
  hasReferralDisclosure: boolean;
  profileFields: MarketplaceFieldDef[];
  attributes: Record<string, unknown>;
  partner: Partner;
  avgRating: number;
  reviewCount: number;
  projectsCompleted: number;
  recentProjectMonths: string[];
}

function formatValue(field: MarketplaceFieldDef, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (field.type === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  return String(value);
}

export function ProfileClient({
  categoryLabel,
  categorySlug,
  disclosureText,
  hasReferralDisclosure,
  profileFields,
  attributes,
  partner,
  avgRating,
  reviewCount,
  projectsCompleted,
  recentProjectMonths,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit() {
    setStatus("submitting");
    setError("");
    const result = await createPublicIntroductionRequestAction({
      partnerSlug: partner.slug,
      categorySlug,
      name: form.name,
      email: form.email,
      phone: form.phone,
    });
    if (!result.ok) { setStatus("error"); setError(result.error); return; }
    setStatus("done");
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <Link href={`/marketplace/${categorySlug}`} className="text-xs text-gray-400 hover:text-forest-600">&larr; {categoryLabel}</Link>

        <div className="flex items-start gap-4 mt-4 mb-6">
          <PartnerLogo logo={partner.logo} name={partner.companyName} size="desktop" />
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{partner.companyName}</h1>
            <p className="text-sm text-gray-500">{[partner.city, partner.state].filter(Boolean).join(", ")}</p>
            <div className="mt-1.5"><RatingStars rating={avgRating} reviewCount={reviewCount} /></div>
          </div>
        </div>

        {partner.aboutUs && <p className="text-sm text-gray-600 leading-relaxed mb-6">{partner.aboutUs}</p>}

        <div className="flex flex-wrap gap-2 mb-6">
          {partner.deliveryMode !== "In-person" && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 font-medium">
              {partner.deliveryMode === "Both" ? "In-person + Virtual" : "Virtual"}
            </span>
          )}
          {partner.priceTier && <span className="text-xs px-2.5 py-1 rounded-full bg-gray-50 text-gray-600">{partner.priceTier}</span>}
          {partner.languages.map((l) => <span key={l} className="text-xs px-2.5 py-1 rounded-full bg-gray-50 text-gray-600">{l}</span>)}
          {partner.seniorSpecialty.map((s) => <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-gray-50 text-gray-600">{s}</span>)}
        </div>

        {profileFields.length > 0 && (
          <div className="border-t border-gray-100 py-6 space-y-2">
            {profileFields.map((f) => (
              <div key={f.key} className="flex justify-between text-sm">
                <span className="text-gray-400">{f.label}</span>
                <span className="text-gray-700 text-right">{formatValue(f, attributes[f.key])}</span>
              </div>
            ))}
          </div>
        )}

        {projectsCompleted > 0 && (
          <div className="border-t border-gray-100 py-6">
            <p className="text-sm text-gray-600">{projectsCompleted} completed project{projectsCompleted !== 1 ? "s" : ""} with Top Tier Transitions clients</p>
            {recentProjectMonths.length > 0 && <p className="text-xs text-gray-400 mt-1">Most recent: {recentProjectMonths.slice(0, 3).join(", ")}</p>}
          </div>
        )}

        {partner.serviceArea.zips.length > 0 && (
          <div className="border-t border-gray-100 py-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Service Area</p>
            <p className="text-sm text-gray-500">{partner.serviceArea.zips.length} zip codes served{partner.serviceArea.statewide ? ` · statewide (${partner.state})` : ""}{partner.serviceArea.nationwide ? " · nationwide (virtual)" : ""}</p>
          </div>
        )}

        <div className="border-t border-gray-100 pt-6 mt-2">
          {!showForm && status !== "done" && (
            <button onClick={() => setShowForm(true)} className="h-11 px-6 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors">
              Request an Introduction
            </button>
          )}

          {showForm && status !== "done" && (
            <div className="max-w-sm space-y-3">
              {hasReferralDisclosure && (
                <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">{disclosureText}</p>
              )}
              <input placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10 px-3 rounded-xl border border-gray-200 text-sm w-full" />
              <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-10 px-3 rounded-xl border border-gray-200 text-sm w-full" />
              <input placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-10 px-3 rounded-xl border border-gray-200 text-sm w-full" />
              <button onClick={submit} disabled={status === "submitting"} className="h-10 px-5 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 disabled:opacity-50">
                {status === "submitting" ? "Sending…" : "Send Request"}
              </button>
              {status === "error" && <p className="text-xs text-red-500">{error}</p>}
            </div>
          )}

          {status === "done" && (
            <p className="text-sm text-forest-700 bg-forest-50 rounded-xl px-4 py-3 max-w-sm">
              Request received — our team will follow up shortly.
            </p>
          )}
        </div>

        {partner.website && (
          <a href={partner.website.startsWith("http") ? partner.website : `https://${partner.website}`} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-gray-400 hover:text-forest-600 mt-6 inline-block">
            Visit website &rarr;
          </a>
        )}
      </div>
    </div>
  );
}
