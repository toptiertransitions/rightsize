"use client";

import { useState } from "react";
import { Phone, Mail, MessageSquare, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeadView, PartnerLeadStatus } from "@/lib/marketplace/leads";
import { updateMyLeadStatusAction } from "./actions";

type Lead = LeadView & { isNew: boolean };

const STATUS_OPTIONS: Array<{ value: PartnerLeadStatus; label: string }> = [
  { value: "Contacted", label: "Contacted" },
  { value: "Engaged", label: "Working together" },
  { value: "Declined", label: "Not a fit" },
];

function fmt(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function tel(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

function LeadCard({ lead }: { lead: Lead }) {
  const [status, setStatus] = useState(lead.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function choose(next: PartnerLeadStatus) {
    if (next === status) return;
    const prev = status;
    setStatus(next);
    setBusy(true);
    setError("");
    const res = await updateMyLeadStatusAction(lead.id, next);
    setBusy(false);
    if (!res.ok) {
      setStatus(prev);
      setError(res.error);
    }
  }

  return (
    <li className="bg-white border border-cream-200 rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-gray-900">
            {lead.clientName || "A family"}
            {lead.isNew && <span className="ml-2 align-middle text-[11px] font-bold uppercase tracking-wide text-white bg-forest-600 rounded-full px-2 py-0.5">New</span>}
          </p>
          <p className="text-sm text-gray-500">{lead.category} · {fmt(lead.requestedAt)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {lead.clientPhone && (
          <>
            <a href={`tel:${tel(lead.clientPhone)}`} className="inline-flex items-center gap-1.5 h-10 px-3 rounded-full border border-forest-600 text-forest-700 text-sm font-semibold">
              <Phone className="w-4 h-4" /> Call
            </a>
            <a href={`sms:${tel(lead.clientPhone)}`} className="inline-flex items-center gap-1.5 h-10 px-3 rounded-full border border-forest-600 text-forest-700 text-sm font-semibold">
              <MessageSquare className="w-4 h-4" /> Text
            </a>
          </>
        )}
        {lead.clientEmail && (
          <a href={`mailto:${lead.clientEmail}`} className="inline-flex items-center gap-1.5 h-10 px-3 rounded-full border border-forest-600 text-forest-700 text-sm font-semibold">
            <Mail className="w-4 h-4" /> Email
          </a>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-500 break-all">
        {[lead.clientPhone, lead.clientEmail].filter(Boolean).join(" · ")}
      </p>

      {lead.answers.length > 0 && (
        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          {lead.answers.map((a) => (
            <div key={a.label} className="bg-cream-50 rounded-xl px-3 py-2">
              <dt className="text-xs text-gray-500">{a.label}</dt>
              <dd className="text-sm text-gray-900">{a.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-4">
        <p className="text-xs font-medium text-gray-500 mb-1.5">Status</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={`Status for ${lead.clientName}`}>
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={status === o.value}
              disabled={busy || status === "Billed"}
              onClick={() => choose(o.value)}
              className={cn(
                "h-11 rounded-xl text-sm font-medium border transition-colors",
                status === o.value ? "bg-forest-600 border-forest-600 text-white" : "bg-white border-gray-300 text-gray-700 hover:border-forest-400"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-red-600 mt-2" role="alert">{error}</p>}
      </div>
    </li>
  );
}

export function LeadsClient({ leads }: { leads: Lead[] }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">
        Families who asked Top Tier to introduce them to you. They&apos;ve agreed to share their contact info and answers. Reach out, then update the status so we know how it&apos;s going.
      </p>
      {leads.length === 0 ? (
        <div className="bg-white border border-cream-200 rounded-2xl p-8 text-center">
          <Inbox className="w-8 h-8 text-gray-300 mx-auto" />
          <p className="text-sm font-medium text-gray-900 mt-3">No leads yet</p>
          <p className="text-sm text-gray-500 mt-1">When a family is matched with you and asks for an introduction, it shows up here and we&apos;ll email you.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {leads.map((l) => <LeadCard key={l.id} lead={l} />)}
        </ul>
      )}
    </div>
  );
}
