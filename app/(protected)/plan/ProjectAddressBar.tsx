"use client";

import { useState, useEffect } from "react";

interface StaffOption {
  clerkUserId: string;
  name: string;
  email: string;
  phone?: string | null;
  profileImageUrl?: string | null;
  role: string;
}

interface Props {
  tenantId: string;
  initialAddress?: string;
  initialCity?: string;
  initialState?: string;
  initialZip?: string;
  initialDestAddress?: string;
  initialDestCity?: string;
  initialDestState?: string;
  initialDestZip?: string;
  // Team Lead
  canEditTeamLead?: boolean;
  initialTeamLeadClerkId?: string;
  initialTeamLeadName?: string;
  initialTeamLeadPhoto?: string;
  initialTeamLeadPhone?: string;
}

function PencilIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function AddressBlock({ label, street, city, state, zip }: { label: string; street?: string; city?: string; state?: string; zip?: string }) {
  const hasAny = street || city || state || zip;
  const cityStateZip = [city, state, zip].filter(Boolean).join(" ");
  return (
    <div className="min-w-0">
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
      {hasAny ? (
        <div className="text-sm text-gray-700 leading-snug mt-0.5">
          {street && <div>{street}</div>}
          {cityStateZip && <div>{cityStateZip}</div>}
        </div>
      ) : (
        <div className="text-sm text-gray-400 italic mt-0.5">Not set</div>
      )}
    </div>
  );
}

function TeamLeadBlock({ name, photo, phone }: { name?: string; photo?: string; phone?: string }) {
  const initials = name
    ? name.split(" ").filter(Boolean).map(n => n[0]).slice(0, 2).join("").toUpperCase()
    : "?";
  return (
    <div className="min-w-0">
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Team Lead</span>
      {name ? (
        <div className="flex items-center gap-2 mt-0.5">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={name} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-forest-100 text-forest-700 flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
              {initials}
            </div>
          )}
          <div>
            <div className="text-sm text-gray-700 leading-snug">{name}</div>
            {phone && <div className="text-xs text-gray-400">{phone}</div>}
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-400 italic mt-0.5">Not assigned</div>
      )}
    </div>
  );
}

const inputCls =
  "h-8 px-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-400 min-w-0 w-full";

export function ProjectAddressBar({
  tenantId,
  initialAddress,
  initialCity,
  initialState,
  initialZip,
  initialDestAddress,
  initialDestCity,
  initialDestState,
  initialDestZip,
  canEditTeamLead,
  initialTeamLeadClerkId,
  initialTeamLeadName,
  initialTeamLeadPhoto,
  initialTeamLeadPhone,
}: Props) {
  const [editing, setEditing] = useState(false);

  // Origin fields
  const [address, setAddress] = useState(initialAddress ?? "");
  const [city, setCity] = useState(initialCity ?? "");
  const [state, setState] = useState(initialState ?? "");
  const [zip, setZip] = useState(initialZip ?? "");

  // Destination fields
  const [destAddress, setDestAddress] = useState(initialDestAddress ?? "");
  const [destCity, setDestCity] = useState(initialDestCity ?? "");
  const [destState, setDestState] = useState(initialDestState ?? "");
  const [destZip, setDestZip] = useState(initialDestZip ?? "");

  // Team lead
  const [teamLeadClerkId, setTeamLeadClerkId] = useState(initialTeamLeadClerkId ?? "");
  const [teamLeadName, setTeamLeadName] = useState(initialTeamLeadName ?? "");
  const [teamLeadPhoto, setTeamLeadPhoto] = useState(initialTeamLeadPhoto ?? "");
  const [teamLeadPhone, setTeamLeadPhone] = useState(initialTeamLeadPhone ?? "");
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load staff list when edit mode opens (only if canEditTeamLead)
  useEffect(() => {
    if (!editing || !canEditTeamLead) return;
    fetch("/api/plan/ttt-users")
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.users)) setStaffOptions(d.users);
      })
      .catch(() => {});
  }, [editing, canEditTeamLead]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          address: address.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          zip: zip.trim() || null,
          destAddress: destAddress.trim() || null,
          destCity: destCity.trim() || null,
          destState: destState.trim() || null,
          destZip: destZip.trim() || null,
          teamLeadClerkId: canEditTeamLead ? (teamLeadClerkId || null) : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Save failed");
      }
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setAddress(initialAddress ?? "");
    setCity(initialCity ?? "");
    setState(initialState ?? "");
    setZip(initialZip ?? "");
    setDestAddress(initialDestAddress ?? "");
    setDestCity(initialDestCity ?? "");
    setDestState(initialDestState ?? "");
    setDestZip(initialDestZip ?? "");
    setTeamLeadClerkId(initialTeamLeadClerkId ?? "");
    setTeamLeadName(initialTeamLeadName ?? "");
    setTeamLeadPhoto(initialTeamLeadPhoto ?? "");
    setTeamLeadPhone(initialTeamLeadPhone ?? "");
    setError(null);
    setEditing(false);
  }

  function handleSelectTeamLead(clerkUserId: string) {
    const staff = staffOptions.find(s => s.clerkUserId === clerkUserId);
    setTeamLeadClerkId(clerkUserId);
    setTeamLeadName(staff?.name ?? "");
    setTeamLeadPhoto(staff?.profileImageUrl ?? "");
    setTeamLeadPhone(staff?.phone ?? "");
  }

  if (editing) {
    return (
      <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Origin */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Origin</p>
            <div className="flex flex-col gap-1.5">
              <input type="text" placeholder="Street address" value={address} onChange={e => setAddress(e.target.value)} className={inputCls} autoFocus />
              <input type="text" placeholder="City" value={city} onChange={e => setCity(e.target.value)} className={inputCls} />
              <input type="text" placeholder="State" value={state} onChange={e => setState(e.target.value)} className={inputCls} />
              <input type="text" placeholder="Zip" value={zip} onChange={e => setZip(e.target.value)} className={inputCls} />
            </div>
          </div>
          {/* Destination */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Destination</p>
            <div className="flex flex-col gap-1.5">
              <input type="text" placeholder="Street address" value={destAddress} onChange={e => setDestAddress(e.target.value)} className={inputCls} />
              <input type="text" placeholder="City" value={destCity} onChange={e => setDestCity(e.target.value)} className={inputCls} />
              <input type="text" placeholder="State" value={destState} onChange={e => setDestState(e.target.value)} className={inputCls} />
              <input type="text" placeholder="Zip" value={destZip} onChange={e => setDestZip(e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        {/* Team Lead (manager/admin only) */}
        {canEditTeamLead && (
          <div className="mt-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Team Lead</p>
            <select
              value={teamLeadClerkId}
              onChange={e => handleSelectTeamLead(e.target.value)}
              className={inputCls}
            >
              <option value="">— Unassigned —</option>
              {staffOptions.map(s => (
                <option key={s.clerkUserId} value={s.clerkUserId}>{s.name} ({s.role})</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
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
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className="group flex flex-wrap items-start gap-x-6 gap-y-2 mt-3">
      <AddressBlock
        label="Origin"
        street={address || initialAddress}
        city={city || initialCity}
        state={state || initialState}
        zip={zip || initialZip}
      />
      <AddressBlock
        label="Destination"
        street={destAddress || initialDestAddress}
        city={destCity || initialDestCity}
        state={destState || initialDestState}
        zip={destZip || initialDestZip}
      />
      <TeamLeadBlock
        name={teamLeadName || initialTeamLeadName}
        photo={teamLeadPhoto || initialTeamLeadPhoto}
        phone={teamLeadPhone || initialTeamLeadPhone}
      />
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors self-center sm:opacity-0 sm:group-hover:opacity-100"
        title="Edit addresses and team lead"
      >
        <PencilIcon />
        <span className="sr-only sm:not-sr-only">Edit</span>
      </button>
    </div>
  );
}
