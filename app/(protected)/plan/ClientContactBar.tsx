"use client";

import { useState } from "react";

interface Props {
  tenantId: string;
  initialEmail?: string;
  initialPhone?: string;
}

function PhoneIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

export function ClientContactBar({ tenantId, initialEmail, initialPhone }: Props) {
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasData = !!(initialPhone || initialEmail || phone || email);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, clientPhone: phone.trim() || null, clientEmail: email.trim() || null }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Save failed");
      }
      // Update displayed values by refreshing page state — simplest approach is to update in place
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setPhone(initialPhone ?? "");
    setEmail(initialEmail ?? "");
    setError(null);
    setEditing(false);
  }

  const inputCls =
    "h-8 px-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-400 min-w-0";

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <div className="flex items-center gap-1.5">
          <PhoneIcon />
          <input
            type="tel"
            placeholder="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={`${inputCls} w-40`}
            autoFocus
          />
        </div>
        <div className="flex items-center gap-1.5">
          <MailIcon />
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${inputCls} w-52`}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-8 px-3 rounded-lg text-xs font-medium bg-forest-600 text-white hover:bg-forest-700 disabled:opacity-60 transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={handleCancel}
            className="h-8 px-3 rounded-lg text-xs text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-xs text-red-600 w-full">{error}</p>}
      </div>
    );
  }

  // View mode
  return (
    <div className="group flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
      {phone ? (
        <a
          href={`tel:${phone.replace(/\D/g, "")}`}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-forest-700 transition-colors"
        >
          <PhoneIcon />
          <span>{phone}</span>
        </a>
      ) : null}

      {email ? (
        <a
          href={`mailto:${email}`}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-forest-700 transition-colors"
        >
          <MailIcon />
          <span>{email}</span>
        </a>
      ) : null}

      {!hasData && (
        <span className="text-sm text-gray-400 italic">No client contact on file</span>
      )}

      {/* Edit pencil — always visible on mobile, hover-only on desktop */}
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
        title="Edit client contact"
      >
        <PencilIcon />
        <span className="sr-only sm:not-sr-only">Edit</span>
      </button>
    </div>
  );
}
