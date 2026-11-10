"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LocalVendor } from "@/lib/types";
import { approveRehomingSubmissionAction, rejectRehomingSubmissionAction } from "./actions";

const TYPE_BADGE: Record<string, string> = {
  "Collector/Reseller": "bg-violet-500/15 text-violet-300 border-violet-500/30",
  "Consignment Store": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "Donation Org": "bg-sky-500/15 text-sky-300 border-sky-500/30",
};

function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

interface Props {
  submissions: LocalVendor[];
  reviewId?: string;
  onEdit: (v: LocalVendor) => void;
}

export function RehomingSubmissionsTab({ submissions, reviewId, onEdit }: Props) {
  if (submissions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-800 p-12 text-center">
        <p className="text-gray-300 font-medium">No submissions waiting</p>
        <p className="text-sm text-gray-500 mt-1">When staff suggest a rehoming resource from the Partners page, it shows up here for approval.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">Rehoming Resource Submissions</h1>
        <p className="text-gray-400 mt-1">
          Suggested by staff. Approving adds it to Rehoming Resources for everyone and emails the person who sent it.
        </p>
      </div>
      <ul className="space-y-4">
        {submissions.map((v) => (
          <SubmissionCard key={v.id} v={v} highlighted={v.id === reviewId} onEdit={() => onEdit(v)} />
        ))}
      </ul>
    </div>
  );
}

function SubmissionCard({ v, highlighted, onEdit }: { v: LocalVendor; highlighted: boolean; onEdit: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLLIElement>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "approve" | "reject">(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "approved" | "rejected">(null);

  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: "center" });
  }, [highlighted]);

  const act = async (approve: boolean) => {
    setBusy(approve ? "approve" : "reject");
    setError(null);
    const res = approve ? await approveRehomingSubmissionAction(v.id, note) : await rejectRehomingSubmissionAction(v.id, note);
    setBusy(null);
    if (!res.ok) { setError(res.error); return; }
    setDone(approve ? "approved" : "rejected");
    router.refresh();
  };

  const address = [v.address, [v.city, v.state].filter(Boolean).join(", "), v.zip].filter(Boolean).join(", ");
  const site = v.website ? (v.website.startsWith("http") ? v.website : `https://${v.website}`) : "";

  if (done) {
    return (
      <li className="rounded-2xl border border-gray-800 bg-gray-900 px-5 py-4 text-sm text-gray-300">
        {done === "approved" ? "Approved" : "Rejected"}: <span className="font-semibold text-white">{v.vendorName}</span>. {v.submittedBy ?? "The submitter"} has been emailed.
      </li>
    );
  }

  return (
    <li ref={ref} className={`rounded-2xl border bg-gray-900 p-5 ${highlighted ? "border-forest-500 ring-1 ring-forest-500" : "border-gray-800"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className={`inline-block text-[11px] font-semibold uppercase tracking-wide border rounded-full px-2.5 py-0.5 ${TYPE_BADGE[v.vendorType] ?? "bg-gray-800 text-gray-300 border-gray-700"}`}>{v.vendorType}</span>
          <h2 className="text-lg font-bold text-white mt-1.5">{v.vendorName}</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Suggested by {v.submittedBy ?? "staff"}{v.submittedAt ? ` · ${fmtDate(v.submittedAt)}` : ""}
          </p>
        </div>
        <button type="button" onClick={onEdit} className="text-xs text-gray-300 border border-gray-700 rounded-lg px-3 py-1.5 hover:bg-gray-800">
          Edit details
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Field label="Accepts">{v.itemCategories}</Field>
        <Field label="Contact">{v.pocName}</Field>
        <Field label="Phone">{v.phone && <a href={`tel:${v.phone.replace(/[^\d+]/g, "")}`} className="text-forest-400 hover:underline">{v.phone}</a>}</Field>
        <Field label="Email">{v.email && <a href={`mailto:${v.email}`} className="text-forest-400 hover:underline break-all">{v.email}</a>}</Field>
        <Field label="Website">{site && <a href={site} target="_blank" rel="noopener noreferrer" className="text-forest-400 hover:underline break-all">{v.website}</a>}</Field>
        <Field label="Address">{address || <span className="text-gray-500">None (online only)</span>}</Field>
        {v.consignmentTake > 0 && <Field label="Consignment">{v.consignmentTake}%</Field>}
      </dl>

      {v.notes && (
        <div className="mt-4 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300 mb-1">Notes from {v.submittedBy ?? "staff"}</p>
          <p className="text-sm text-amber-100/90 whitespace-pre-line">{v.notes}</p>
        </div>
      )}

      <div className="mt-4 flex flex-col md:flex-row gap-3 md:items-end">
        <label className="flex-1">
          <span className="text-xs text-gray-400">Note to {v.submittedBy?.split(" ")[0] ?? "submitter"} (optional, included in their email)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Great find, thanks! / Already working with them under another name"
            className="mt-1 w-full h-10 px-3 rounded-xl border border-gray-700 bg-gray-800 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-forest-500"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => act(false)}
            disabled={!!busy}
            className="h-10 px-4 rounded-xl border border-gray-700 text-sm font-medium text-gray-300 hover:bg-gray-800 disabled:opacity-50"
          >
            {busy === "reject" ? "Rejecting…" : "Reject"}
          </button>
          <button
            type="button"
            onClick={() => act(true)}
            disabled={!!busy}
            className="h-10 px-5 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700 disabled:opacity-50"
          >
            {busy === "approve" ? "Approving…" : "Approve & add"}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="flex gap-3 min-w-0">
      <dt className="w-24 flex-shrink-0 text-gray-500">{label}</dt>
      <dd className="text-gray-200 min-w-0">{children}</dd>
    </div>
  );
}
