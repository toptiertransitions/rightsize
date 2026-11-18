"use client";

// Realtor referral disclosure UI. All wording comes from
// lib/partners/realtorDisclosure.ts; these only render it. Nothing here is
// shown unless the page passes realtorDisclosure (REALTOR_DISCLOSURE_FLAG).
import { useEffect, useId, useRef, useState } from "react";
import { useBackClose } from "@/lib/back-button";
import { REALTOR_DISCLOSURE, canSubmitRealtorAck, type RealtorAckInput } from "@/lib/partners/realtorDisclosure";

function DisclosureParagraphs({ className = "" }: { className?: string }) {
  return (
    <div className={`space-y-2.5 text-sm text-gray-700 leading-relaxed ${className}`}>
      {REALTOR_DISCLOSURE.body.map((para, i) =>
        i === REALTOR_DISCLOSURE.body.length - 1 && para.includes("idfpr.illinois.gov") ? (
          <p key={i}>
            {para.split("idfpr.illinois.gov")[0]}
            <a href={REALTOR_DISCLOSURE.verifyUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-forest-700 underline underline-offset-2 hover:text-forest-800">
              idfpr.illinois.gov
            </a>
            {para.split("idfpr.illinois.gov")[1]}
          </p>
        ) : (
          <p key={i}>{para}</p>
        )
      )}
    </div>
  );
}

/** The full disclosure, always visible (Partner page, Realtor category). */
export function RealtorDisclosureBlock() {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="mb-4 rounded-2xl border border-forest-200 bg-forest-50/60 p-4 sm:p-5">
      <h3 id={headingId} className="text-sm sm:text-base font-semibold text-gray-900 mb-2">{REALTOR_DISCLOSURE.heading}</h3>
      <DisclosureParagraphs />
    </section>
  );
}

/** Short in-flow reminder; "Learn more" expands the full text in place. */
export function RealtorDisclosureReminder({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div role="note" className={`rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-xs text-gray-600 leading-relaxed ${className}`}>
      <p>
        {REALTOR_DISCLOSURE.short}{" "}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="font-semibold text-forest-700 underline underline-offset-2 hover:text-forest-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-500 rounded"
        >
          {open ? "Show less" : REALTOR_DISCLOSURE.learnMore}
        </button>
      </p>
      {open && (
        <div id={panelId} className="mt-2.5 pt-2.5 border-t border-gray-200">
          <p className="text-xs font-semibold text-gray-900 mb-1.5">{REALTOR_DISCLOSURE.heading}</p>
          <DisclosureParagraphs className="!text-xs" />
        </div>
      )}
    </div>
  );
}

export const EMPTY_REALTOR_ACK: RealtorAckInput = {
  version: REALTOR_DISCLOSURE.version,
  understandsCompensation: false,
  consentsToShareInfo: false,
  staffConfirmedClientAgreed: false,
};

function Check({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        required
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-forest-600 focus:ring-2 focus:ring-forest-500 focus:ring-offset-1"
      />
      <label htmlFor={id} className="text-sm text-gray-800 leading-snug cursor-pointer">{children}</label>
    </div>
  );
}

/** Full disclosure plus the two required checkboxes (and, for staff acting
 * for the client, a third confirmation). */
export function RealtorAckFields({ value, onChange, actingAsStaff, clientLabel }: {
  value: RealtorAckInput;
  onChange: (v: RealtorAckInput) => void;
  actingAsStaff: boolean;
  clientLabel?: string;
}) {
  const id = useId();
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-gray-900 mb-2">{REALTOR_DISCLOSURE.heading}</legend>
      <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white p-3" tabIndex={0} aria-label="Disclosure text">
        <DisclosureParagraphs className="!text-[13px]" />
      </div>
      {actingAsStaff && (
        <p className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          You&rsquo;re matching on behalf of {clientLabel || "the client"}. Check each statement only if the client has agreed to it.
        </p>
      )}
      <Check id={`${id}-comp`} checked={value.understandsCompensation} onChange={(v) => onChange({ ...value, understandsCompensation: v })}>
        {REALTOR_DISCLOSURE.checkboxCompensation}
      </Check>
      <Check id={`${id}-share`} checked={value.consentsToShareInfo} onChange={(v) => onChange({ ...value, consentsToShareInfo: v })}>
        {REALTOR_DISCLOSURE.checkboxShareInfo}
      </Check>
      {actingAsStaff && (
        <Check id={`${id}-staff`} checked={!!value.staffConfirmedClientAgreed} onChange={(v) => onChange({ ...value, staffConfirmedClientAgreed: v })}>
          {REALTOR_DISCLOSURE.staffConfirm}
        </Check>
      )}
    </fieldset>
  );
}

/** Dialog shown before selecting a realtor on the TTT Partner page. */
export function RealtorAckDialog({ realtorName, actingAsStaff, clientLabel, pending, onConfirm, onClose }: {
  realtorName: string;
  actingAsStaff: boolean;
  clientLabel?: string;
  pending: boolean;
  onConfirm: (ack: RealtorAckInput) => void;
  onClose: () => void;
}) {
  const [ack, setAck] = useState<RealtorAckInput>(EMPTY_REALTOR_ACK);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const ready = canSubmitRealtorAck(ack, actingAsStaff);
  useBackClose(onClose);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
      // Keep Tab inside the dialog
      if (e.key === "Tab" && dialogRef.current) {
        const els = dialogRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),[tabindex="0"]');
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); prev?.focus(); };
  }, [onClose, pending]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={() => !pending && onClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[90vh] flex flex-col focus:outline-none motion-safe:animate-[fadeInScale_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 sm:px-6 pt-5 pb-3 shrink-0">
          <h2 id={titleId} className="text-lg font-bold text-gray-900">Before we introduce {realtorName}</h2>
        </div>
        <form
          className="overflow-y-auto px-5 sm:px-6 pb-5 sm:pb-6"
          onSubmit={(e) => { e.preventDefault(); if (ready && !pending) onConfirm(ack); }}
        >
          <RealtorAckFields value={ack} onChange={setAck} actingAsStaff={actingAsStaff} clientLabel={clientLabel} />
          <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button type="button" onClick={onClose} disabled={pending} className="min-h-[44px] px-4 rounded-xl text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!ready || pending}
              className="min-h-[44px] px-5 rounded-xl text-sm font-semibold bg-forest-600 text-white hover:bg-forest-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-500"
            >
              {pending ? "Saving…" : `Continue with ${realtorName}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
