"use client";

import { useState, useEffect } from "react";
import type { Estate, EstateStatus, EstateSaleType, Tenant, EstateSaleShopper, EstateSaleShopperSource } from "@/lib/types";
import { computeDutchPrice } from "@/lib/estate-utils";

// Convert 24h "HH:mm" (from <input type="time">) to "H:MM AM/PM" for storage.
function to12h(h24: string): string {
  if (!h24) return "";
  const [h, m] = h24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// Convert stored "H:MM AM/PM" back to 24h "HH:mm" for <input type="time">.
function to24h(ampm: string): string {
  if (!ampm) return "";
  const match = ampm.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return "";
  let h = parseInt(match[1]);
  const m = match[2];
  const isPM = match[3].toUpperCase() === "PM";
  if (isPM && h !== 12) h += 12;
  if (!isPM && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m}`;
}

// Extract just the YYYY-MM-DD portion from any date/datetime string.
function toDateOnly(s: string): string {
  if (!s) return "";
  return s.slice(0, 10);
}

interface EstatesClientProps {
  estates: Estate[];
  tenants: Tenant[];
}

const STATUS_COLORS: Record<EstateStatus, string> = {
  Upcoming: "bg-blue-900/40 text-blue-300 border border-blue-700",
  Active:   "bg-green-900/40 text-green-300 border border-green-700",
  Closed:   "bg-gray-800 text-gray-400 border border-gray-700",
};

const EMPTY_FORM: Omit<Estate, "id" | "airtableId" | "createdAt"> = {
  name: "",
  slug: "",
  tenantId: "",
  description: "",
  status: "Upcoming",
  saleType: "Online",
  saleStartDate: "",
  saleStartTime: "",
  saleEndDate: "",
  saleEndTime: "",
  dropIntervalHours: 48,
  dropPercent: 10,
  floorPercent: 40,
  pickupAddress: "",
  pickupWindowStart: "",
  pickupWindowEnd: "",
  pickupWindowStartTime: "",
  pickupWindowEndTime: "",
  shippingAvailable: false,
  shippingNotes: "",
  pickupNotes: "",
  hideSoldItems: false,
  terms: "",
  contactEmail: "",
  contactPhone: "",
  cityRegion: "",
  featuredImageUrl: "",
  featuredImagePublicId: "",
  galleryJson: "",
  pickeryUrl: "",
};

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function nextDropLabel(estate: Estate): string {
  if (estate.status !== "Active") return "";
  const pricing = computeDutchPrice(100, estate, Date.now());
  if (pricing.atFloor || !pricing.nextDropAt) return "At floor";
  const diff = new Date(pricing.nextDropAt).getTime() - Date.now();
  if (diff <= 0) return "Dropping soon";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `Next drop in ${h}h ${m}m`;
}

export function EstatesClient({ estates: initial, tenants }: EstatesClientProps) {
  const [estates, setEstates] = useState<Estate[]>(initial);
  const [editing, setEditing] = useState<Estate | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Omit<Estate, "id" | "airtableId" | "createdAt">>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [emailingId, setEmailingId] = useState<string | null>(null);
  const [emailResult, setEmailResult] = useState<{ id: string; sent: number; total: number } | null>(null);
  const [downloadingCsvId, setDownloadingCsvId] = useState<string | null>(null);
  const [downloadingZipId, setDownloadingZipId] = useState<string | null>(null);

  const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t.name]));

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditing(null);
    setCreating(true);
    setError("");
  }

  function openEdit(estate: Estate) {
    setForm({
      name: estate.name,
      slug: estate.slug,
      tenantId: estate.tenantId,
      description: estate.description,
      status: estate.status,
      saleType: estate.saleType || "Online",
      saleStartDate: toDateOnly(estate.saleStartDate),
      saleStartTime: estate.saleStartTime ?? "",
      saleEndDate: toDateOnly(estate.saleEndDate),
      saleEndTime: estate.saleEndTime ?? "",
      dropIntervalHours: estate.dropIntervalHours,
      dropPercent: estate.dropPercent,
      floorPercent: estate.floorPercent,
      pickupAddress: estate.pickupAddress,
      pickupWindowStart: estate.pickupWindowStart,
      pickupWindowEnd: estate.pickupWindowEnd,
      pickupWindowStartTime: estate.pickupWindowStartTime ?? "",
      pickupWindowEndTime: estate.pickupWindowEndTime ?? "",
      shippingAvailable: estate.shippingAvailable,
      shippingNotes: estate.shippingNotes,
      pickupNotes: estate.pickupNotes,
      hideSoldItems: estate.hideSoldItems,
      terms: estate.terms,
      contactEmail: estate.contactEmail,
      contactPhone: estate.contactPhone,
      cityRegion: estate.cityRegion,
      featuredImageUrl: estate.featuredImageUrl,
      featuredImagePublicId: estate.featuredImagePublicId,
      galleryJson: estate.galleryJson || "",
      pickeryUrl: estate.pickeryUrl || "",
    });
    setEditing(estate);
    setCreating(false);
    setError("");
  }

  function closeForm() {
    setEditing(null);
    setCreating(false);
    setError("");
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (!form.slug.trim()) { setError("Slug is required"); return; }
    setSaving(true);
    setError("");
    try {
      if (creating) {
        const res = await fetch("/api/admin/estates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Save failed");
        const { estate } = await res.json();
        setEstates(prev => [estate, ...prev]);
      } else if (editing) {
        const res = await fetch(`/api/admin/estates/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Save failed");
        const { estate } = await res.json();
        setEstates(prev => prev.map(e => e.id === editing.id ? estate : e));
      }
      closeForm();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this estate? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/estates/${id}`, { method: "DELETE" });
    if (res.ok) {
      setEstates(prev => prev.filter(e => e.id !== id));
      if (editing?.id === id) closeForm();
    }
  }

  async function handleSendPickupEmails(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Send pickup detail emails to all buyers for this estate?")) return;
    setEmailingId(id);
    setEmailResult(null);
    try {
      const res = await fetch(`/api/admin/estates/${id}/send-pickup-emails`, { method: "POST" });
      const data = await res.json() as { sent: number; total: number; message?: string };
      setEmailResult({ id, sent: data.sent, total: data.total ?? data.sent });
    } catch {
      alert("Failed to send emails. Check server logs.");
    } finally {
      setEmailingId(null);
    }
  }

  async function handleDownloadCsv(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDownloadingCsvId(id);
    try {
      const res = await fetch(`/api/admin/estates/${id}/download-csv`);
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] ?? "items.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download CSV.");
    } finally {
      setDownloadingCsvId(null);
    }
  }

  async function handleDownloadImages(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDownloadingZipId(id);
    try {
      const res = await fetch(`/api/admin/estates/${id}/download-images`);
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] ?? "images.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download images ZIP.");
    } finally {
      setDownloadingZipId(null);
    }
  }

  async function handleImageUpload(file: File) {
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "estates");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const { photoUrl, photoPublicId } = await res.json();
      setForm(f => ({ ...f, featuredImageUrl: photoUrl, featuredImagePublicId: photoPublicId }));
    } catch (e) {
      setError(String(e));
    } finally {
      setUploadingImage(false);
    }
  }

  const showForm = creating || !!editing;

  return (
    <div>
    <div className="flex gap-8">
      {/* Estate List */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Estate Sales</h1>
            <p className="text-gray-400 text-sm mt-1">{estates.length} estates</p>
          </div>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-forest-600 text-white text-sm font-medium rounded-lg hover:bg-forest-700 transition-colors"
          >
            + New Estate
          </button>
        </div>

        {estates.length === 0 ? (
          <p className="text-gray-500 text-sm">No estates yet. Create one to get started.</p>
        ) : (
          <div className="space-y-3">
            {estates.map(estate => (
              <div
                key={estate.id}
                className={`bg-gray-900 border rounded-xl p-5 cursor-pointer hover:border-gray-600 transition-colors ${
                  editing?.id === estate.id ? "border-forest-500" : "border-gray-800"
                }`}
                onClick={() => openEdit(estate)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 min-w-0">
                    {estate.featuredImageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={estate.featuredImageUrl}
                        alt={estate.name}
                        className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-white font-medium">{estate.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[estate.status]}`}>
                          {estate.status}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${estate.saleType === "In-Person" ? "bg-purple-900/40 text-purple-300 border border-purple-700" : "bg-amber-900/40 text-amber-300 border border-amber-700"}`}>
                          {estate.saleType || "Online"}
                        </span>
                      </div>
                      <p className="text-gray-400 text-sm mt-0.5">{estate.cityRegion}</p>
                      {estate.tenantId && (
                        <p className="text-gray-500 text-xs mt-0.5">
                          Client: {tenantMap[estate.tenantId] || estate.tenantId}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span>/{estate.slug}</span>
                        {estate.saleType !== "In-Person" && (
                          <span>Drop every {estate.dropIntervalHours}h · {estate.dropPercent}% · floor {estate.floorPercent}%</span>
                        )}
                        {estate.status === "Active" && estate.saleType !== "In-Person" && (
                          <span className="text-amber-400">{nextDropLabel(estate)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a
                      href={`/api/admin/estates/${estate.id}/buyers-pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      title="Export Pickup Sheet PDF"
                      className="text-gray-500 hover:text-amber-400 transition-colors text-xs px-2 py-1 rounded border border-gray-700 hover:border-amber-600 flex items-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                      </svg>
                      Pickup Sheet
                    </a>
                    <button
                      onClick={e => handleSendPickupEmails(estate.id, e)}
                      disabled={emailingId === estate.id}
                      title="Email pickup details to all buyers"
                      className="text-gray-500 hover:text-emerald-400 transition-colors text-xs px-2 py-1 rounded border border-gray-700 hover:border-emerald-600 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {emailingId === estate.id ? (
                        <>
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Sending…
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          {emailResult?.id === estate.id ? `Sent (${emailResult.sent}/${emailResult.total})` : "Email Details"}
                        </>
                      )}
                    </button>
                    <button
                      onClick={e => handleDownloadCsv(estate.id, e)}
                      disabled={downloadingCsvId === estate.id}
                      title="Download item names as CSV"
                      className="text-gray-500 hover:text-sky-400 transition-colors text-xs px-2 py-1 rounded border border-gray-700 hover:border-sky-600 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {downloadingCsvId === estate.id ? "Exporting…" : "CSV"}
                    </button>
                    <button
                      onClick={e => handleDownloadImages(estate.id, e)}
                      disabled={downloadingZipId === estate.id}
                      title="Download all primary images as ZIP"
                      className="text-gray-500 hover:text-violet-400 transition-colors text-xs px-2 py-1 rounded border border-gray-700 hover:border-violet-600 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {downloadingZipId === estate.id ? "Zipping…" : "Images ZIP"}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(estate.id); }}
                      className="text-gray-600 hover:text-red-400 transition-colors text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form Panel */}
      {showForm && (
        <div className="w-[440px] flex-shrink-0">
          <div className="sticky top-4 bg-gray-900 border border-gray-700 rounded-2xl p-6 max-h-[calc(100vh-6rem)] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">
                {creating ? "New Estate" : "Edit Estate"}
              </h2>
              <button onClick={closeForm} className="text-gray-500 hover:text-white">✕</button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-700 text-red-300 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <Field label="Name *">
                <input
                  className={inputCls}
                  value={form.name}
                  onChange={e => {
                    const name = e.target.value;
                    setForm(f => ({
                      ...f,
                      name,
                      slug: creating && !f.slug ? slugify(name) : f.slug,
                    }));
                  }}
                  placeholder="Lincoln Park Victorian"
                />
              </Field>

              <Field label="Slug *">
                <input
                  className={inputCls}
                  value={form.slug}
                  onChange={e => setForm(f => ({ ...f, slug: slugify(e.target.value) }))}
                  placeholder="lincoln-park-victorian"
                />
              </Field>

              <Field label="City / Region">
                <input
                  className={inputCls}
                  value={form.cityRegion}
                  onChange={e => setForm(f => ({ ...f, cityRegion: e.target.value }))}
                  placeholder="Lincoln Park, Chicago"
                />
              </Field>

              <Field label="Client Project">
                <TenantCombobox
                  value={form.tenantId}
                  onChange={id => setForm(f => ({ ...f, tenantId: id }))}
                  tenants={tenants}
                />
              </Field>

              <Field label="Status">
                <select
                  className={inputCls}
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as EstateStatus }))}
                >
                  <option value="Upcoming">Upcoming</option>
                  <option value="Active">Active</option>
                  <option value="Closed">Closed</option>
                </select>
              </Field>

              <Field label="Sale Type">
                <select
                  className={inputCls}
                  value={form.saleType}
                  onChange={e => setForm(f => ({ ...f, saleType: e.target.value as EstateSaleType }))}
                >
                  <option value="Online">Online (Dutch Auction)</option>
                  <option value="In-Person">In-Person</option>
                </select>
              </Field>

              <Field label="Sale Start Date & Time (CST)">
                <div className="flex gap-2">
                  <input
                    type="date"
                    className={inputCls}
                    value={form.saleStartDate}
                    onChange={e => setForm(f => ({ ...f, saleStartDate: e.target.value }))}
                  />
                  <input
                    type="time"
                    className={`${inputCls} w-32 flex-shrink-0`}
                    value={to24h(form.saleStartTime ?? "")}
                    onChange={e => setForm(f => ({ ...f, saleStartTime: to12h(e.target.value) }))}
                  />
                </div>
              </Field>
              <Field label="Sale End Date & Time (CST)">
                <div className="flex gap-2">
                  <input
                    type="date"
                    className={inputCls}
                    value={form.saleEndDate}
                    onChange={e => setForm(f => ({ ...f, saleEndDate: e.target.value }))}
                  />
                  <input
                    type="time"
                    className={`${inputCls} w-32 flex-shrink-0`}
                    value={to24h(form.saleEndTime ?? "")}
                    onChange={e => setForm(f => ({ ...f, saleEndTime: to12h(e.target.value) }))}
                  />
                </div>
              </Field>

              {form.saleType === "Online" && (
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Drop Interval (h)">
                    <input
                      type="number"
                      className={inputCls}
                      value={form.dropIntervalHours}
                      onChange={e => setForm(f => ({ ...f, dropIntervalHours: Number(e.target.value) }))}
                      min={1}
                    />
                  </Field>
                  <Field label="Drop % per step">
                    <input
                      type="number"
                      className={inputCls}
                      value={form.dropPercent}
                      onChange={e => setForm(f => ({ ...f, dropPercent: Number(e.target.value) }))}
                      min={1}
                      max={99}
                    />
                  </Field>
                  <Field label="Floor %">
                    <input
                      type="number"
                      className={inputCls}
                      value={form.floorPercent}
                      onChange={e => setForm(f => ({ ...f, floorPercent: Number(e.target.value) }))}
                      min={1}
                      max={99}
                    />
                  </Field>
                </div>
              )}

              <Field label="Description">
                <textarea
                  className={inputCls}
                  rows={3}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Overview of the estate and its history…"
                />
              </Field>

              <Field label="Pickup Address">
                <input
                  className={inputCls}
                  value={form.pickupAddress}
                  onChange={e => setForm(f => ({ ...f, pickupAddress: e.target.value }))}
                  placeholder="1234 N Lincoln Ave, Chicago IL 60614"
                />
              </Field>

              <Field label="Pickup Window Start">
                <div className="flex gap-2">
                  <input
                    type="date"
                    className={inputCls}
                    value={form.pickupWindowStart ? form.pickupWindowStart.slice(0, 10) : ""}
                    onChange={e => setForm(f => ({ ...f, pickupWindowStart: e.target.value }))}
                  />
                  <input
                    type="text"
                    className={`${inputCls} w-36 flex-shrink-0`}
                    value={form.pickupWindowStartTime ?? ""}
                    onChange={e => setForm(f => ({ ...f, pickupWindowStartTime: e.target.value }))}
                    placeholder="e.g. 10:00 AM"
                  />
                </div>
              </Field>
              <Field label="Pickup Window End">
                <div className="flex gap-2">
                  <input
                    type="date"
                    className={inputCls}
                    value={form.pickupWindowEnd ? form.pickupWindowEnd.slice(0, 10) : ""}
                    onChange={e => setForm(f => ({ ...f, pickupWindowEnd: e.target.value }))}
                  />
                  <input
                    type="text"
                    className={`${inputCls} w-36 flex-shrink-0`}
                    value={form.pickupWindowEndTime ?? ""}
                    onChange={e => setForm(f => ({ ...f, pickupWindowEndTime: e.target.value }))}
                    placeholder="e.g. 4:00 PM"
                  />
                </div>
              </Field>

              <Field label="Pickup Notes">
                <textarea
                  className={inputCls}
                  rows={3}
                  value={form.pickupNotes}
                  onChange={e => setForm(f => ({ ...f, pickupNotes: e.target.value }))}
                  placeholder="Parking info, entry instructions, what to bring, etc."
                />
              </Field>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="shipping"
                  checked={form.shippingAvailable}
                  onChange={e => setForm(f => ({ ...f, shippingAvailable: e.target.checked }))}
                  className="w-4 h-4 accent-forest-600"
                />
                <label htmlFor="shipping" className="text-sm text-gray-300">Shipping Available</label>
              </div>

              {form.shippingAvailable && (
                <Field label="Shipping Notes">
                  <textarea
                    className={inputCls}
                    rows={2}
                    value={form.shippingNotes}
                    onChange={e => setForm(f => ({ ...f, shippingNotes: e.target.value }))}
                    placeholder="Buyer pays actual shipping via UPS/FedEx…"
                  />
                </Field>
              )}

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="hideSoldItems"
                  checked={form.hideSoldItems}
                  onChange={e => setForm(f => ({ ...f, hideSoldItems: e.target.checked }))}
                  className="w-4 h-4 accent-forest-600"
                />
                <label htmlFor="hideSoldItems" className="text-sm text-gray-300">
                  Hide sold items from buyers on ProFound Finds
                </label>
              </div>

              <Field label="Terms">
                <textarea
                  className={inputCls}
                  rows={3}
                  value={form.terms}
                  onChange={e => setForm(f => ({ ...f, terms: e.target.value }))}
                  placeholder="All items sold as-is. No returns…"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Contact Email">
                  <input
                    className={inputCls}
                    type="email"
                    value={form.contactEmail}
                    onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))}
                  />
                </Field>
                <Field label="Contact Phone">
                  <input
                    className={inputCls}
                    value={form.contactPhone}
                    onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))}
                  />
                </Field>
              </div>

              {form.saleType === "In-Person" && (
                <Field label="Pickery Signup URL">
                  <input
                    className={inputCls}
                    type="url"
                    value={form.pickeryUrl ?? ""}
                    onChange={e => setForm(f => ({ ...f, pickeryUrl: e.target.value }))}
                    placeholder="https://pickery.com/..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Shown as a &quot;Secure a Spot on Pickery&quot; button on ProFoundFinds item listings.
                  </p>
                </Field>
              )}

              {/* Featured Image */}
              <Field label="Featured Image">
                <div className="space-y-2">
                  {form.featuredImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.featuredImageUrl}
                      alt="Featured"
                      className="w-full h-32 object-cover rounded-lg"
                    />
                  )}
                  <label className="block cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]); }}
                    />
                    <span className={`block text-center py-2 px-4 rounded-lg text-sm border transition-colors ${
                      uploadingImage
                        ? "border-gray-700 text-gray-500 cursor-wait"
                        : "border-gray-600 text-gray-300 hover:border-forest-500 hover:text-white cursor-pointer"
                    }`}>
                      {uploadingImage ? "Uploading…" : form.featuredImageUrl ? "Replace Image" : "Upload Image"}
                    </span>
                  </label>
                </div>
              </Field>

              {/* Gallery (In-Person) */}
              {form.saleType === "In-Person" && (
                <Field label="Gallery JSON (optional)">
                  <textarea
                    className={inputCls}
                    rows={3}
                    value={form.galleryJson}
                    onChange={e => setForm(f => ({ ...f, galleryJson: e.target.value }))}
                    placeholder='[{"url":"https://..."},{"url":"https://..."}]'
                  />
                  <p className="text-xs text-gray-500 mt-1">JSON array of {`{"url":"..."}`} objects for the photo gallery.</p>
                </Field>
              )}

              {/* Estate ID (for linking items) */}
              {editing && (
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Estate ID (use in item EstateSaleId field)</p>
                  <p className="text-xs text-gray-300 font-mono break-all">{editing.id}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-forest-600 text-white text-sm font-medium rounded-lg hover:bg-forest-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving…" : creating ? "Create Estate" : "Save Changes"}
              </button>
              <button
                onClick={closeForm}
                className="px-4 py-2.5 bg-gray-800 text-gray-300 text-sm rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Shoppers CRM */}
    <div className="mt-12">
      <ShoppersSection />
    </div>
    </div>
  );
}

// ─── Estate Sale Shoppers Mini-CRM ────────────────────────────────────────────

const CATEGORY_OPTIONS = ["Furniture", "Jewelry", "Art", "Vintage", "Décor", "Other"];
const SOURCE_OPTIONS: EstateSaleShopperSource[] = ["Online Estate Sale", "Online Catalog", "In-Person", "Manual"];

const EMPTY_SHOPPER_FORM = {
  name: "", email: "", phone: "", zip: "", city: "",
  source: "Manual" as EstateSaleShopperSource,
  categoryInterests: "",
  notes: "",
  optOut: false,
};

function ShoppersSection() {
  const [shoppers, setShoppers] = useState<EstateSaleShopper[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showOptedOut, setShowOptedOut] = useState(false);
  const [editing, setEditing] = useState<EstateSaleShopper | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_SHOPPER_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/estate-shoppers")
      .then(r => r.json())
      .then(d => setShoppers(d.shoppers ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const reload = () =>
    fetch("/api/admin/estate-shoppers")
      .then(r => r.json())
      .then(d => setShoppers(d.shoppers ?? []));

  const filtered = shoppers.filter(s => {
    if (!showOptedOut && s.optOut) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return s.name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      (s.city ?? "").toLowerCase().includes(q) ||
      (s.zip ?? "").toLowerCase().includes(q);
  });

  const totalSpend = shoppers.filter(s => !s.optOut).reduce((sum, s) => sum + s.totalSpend, 0);
  const activeCount = shoppers.filter(s => !s.optOut).length;
  const optedOutCount = shoppers.filter(s => s.optOut).length;

  function openCreate() {
    setForm(EMPTY_SHOPPER_FORM);
    setEditing(null);
    setCreating(true);
    setError("");
  }

  function openEdit(s: EstateSaleShopper) {
    setForm({
      name: s.name,
      email: s.email,
      phone: s.phone ?? "",
      zip: s.zip ?? "",
      city: s.city ?? "",
      source: s.source,
      categoryInterests: s.categoryInterests ?? "",
      notes: s.notes ?? "",
      optOut: s.optOut,
    });
    setEditing(s);
    setCreating(false);
    setError("");
  }

  function closeForm() {
    setEditing(null);
    setCreating(false);
    setError("");
  }

  async function handleSave() {
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (creating) {
        const res = await fetch("/api/admin/estate-shoppers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Save failed");
        const { shopper } = await res.json();
        setShoppers(prev => [shopper, ...prev]);
      } else if (editing) {
        const res = await fetch("/api/admin/estate-shoppers", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editing.id, ...form }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Save failed");
        const { shopper } = await res.json();
        setShoppers(prev => prev.map(s => s.id === shopper.id ? shopper : s));
      }
      closeForm();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/admin/estate-shoppers?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setShoppers(prev => prev.filter(s => s.id !== id));
      setDeleteConfirm(null);
      closeForm();
    }
  }

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  const showForm = creating || !!editing;

  const interests = form.categoryInterests ? form.categoryInterests.split(",").map(s => s.trim()).filter(Boolean) : [];
  function toggleInterest(cat: string) {
    const set = new Set(interests);
    if (set.has(cat)) set.delete(cat); else set.add(cat);
    setForm(f => ({ ...f, categoryInterests: Array.from(set).join(", ") }));
  }

  return (
    <div>
      <div className="border-t border-gray-800 pt-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">Estate Sale Shoppers</h2>
            <p className="text-gray-400 text-sm mt-0.5">{shoppers.length} shoppers · {activeCount} active · {fmt(totalSpend)} total spend</p>
          </div>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-forest-600 text-white text-sm font-medium rounded-lg hover:bg-forest-700 transition-colors"
          >
            + Add Shopper
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Shoppers", value: shoppers.length },
            { label: "Active (not opted out)", value: activeCount },
            { label: "Opted Out", value: optedOutCount },
            { label: "Total Spend (active)", value: fmt(totalSpend) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
              <div className="text-xl font-bold text-white">{value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-4 mb-4 flex-wrap items-center">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, city, zip…"
            className="w-full max-w-sm rounded-xl bg-gray-900 border border-gray-800 text-gray-200 placeholder-gray-600 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
          />
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showOptedOut}
              onChange={e => setShowOptedOut(e.target.checked)}
              className="rounded border-gray-600"
            />
            Show opted-out
          </label>
        </div>

        <div className="flex gap-6">
          {/* Table */}
          <div className="flex-1 min-w-0">
            {loading ? (
              <p className="text-gray-500 text-sm">Loading…</p>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl bg-gray-900 border border-gray-800 px-6 py-10 text-center text-gray-500 text-sm">
                {shoppers.length === 0 ? "No shoppers yet. Add one or sync from ProFoundFinds orders." : "No shoppers match your search."}
              </div>
            ) : (
              <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-800">
                    <tr className="text-xs text-gray-500 text-left">
                      <th className="px-4 py-3 font-medium">Name / Email</th>
                      <th className="px-4 py-3 font-medium">Location</th>
                      <th className="px-4 py-3 font-medium">Source</th>
                      <th className="px-4 py-3 font-medium text-right">Purchases</th>
                      <th className="px-4 py-3 font-medium text-right">Spend</th>
                      <th className="px-4 py-3 font-medium">Last Purchase</th>
                      <th className="px-4 py-3 font-medium">Interests</th>
                      <th className="px-4 py-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {filtered.map(s => (
                      <tr
                        key={s.id}
                        onClick={() => openEdit(s)}
                        className={`cursor-pointer hover:bg-gray-800/50 transition-colors ${s.optOut ? "opacity-50" : ""} ${editing?.id === s.id ? "bg-gray-800" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-100">{s.name}</div>
                          <div className="text-xs text-gray-500">{s.email}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {[s.city, s.zip].filter(Boolean).join(" ") || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-gray-800 border border-gray-700 text-gray-400 px-2 py-0.5 rounded-full">{s.source}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">{s.purchaseCount}</td>
                        <td className="px-4 py-3 text-right text-gray-300">{fmt(s.totalSpend)}</td>
                        <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(s.lastPurchaseDate)}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px] truncate">{s.categoryInterests || "—"}</td>
                        <td className="px-4 py-3 text-right">
                          {s.optOut && <span className="text-xs text-red-500 font-medium">Opted out</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Form Panel */}
          {showForm && (
            <div className="w-[360px] flex-shrink-0">
              <div className="sticky top-4 bg-gray-900 border border-gray-700 rounded-2xl p-5 max-h-[calc(100vh-6rem)] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-white">{creating ? "Add Shopper" : "Edit Shopper"}</h3>
                  <button onClick={closeForm} className="text-gray-500 hover:text-gray-300 text-lg leading-none">&times;</button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Name *</label>
                    <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Email *</label>
                    <input className={inputCls} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Phone</label>
                      <input className={inputCls} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 555-5555" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">City</label>
                      <input className={inputCls} value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Denver" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Zip</label>
                      <input className={inputCls} value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} placeholder="80202" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Source</label>
                      <select className={inputCls} value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value as EstateSaleShopperSource }))}>
                        {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Category Interests</label>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORY_OPTIONS.map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => toggleInterest(cat)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            interests.includes(cat)
                              ? "bg-forest-700 border-forest-500 text-forest-100"
                              : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Notes</label>
                    <textarea className={inputCls} rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Staff notes…" />
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.optOut}
                      onChange={e => setForm(f => ({ ...f, optOut: e.target.checked }))}
                      className="rounded border-gray-600"
                    />
                    <span className="text-sm text-gray-300">Opted out of communications</span>
                  </label>

                  {editing && (
                    <div className="bg-gray-800 rounded-lg p-3 text-xs text-gray-500 space-y-0.5">
                      <div>Purchases: {editing.purchaseCount} · Spend: {fmt(editing.totalSpend)}</div>
                      <div>First: {fmtDate(editing.firstPurchaseDate)} · Last: {fmtDate(editing.lastPurchaseDate)}</div>
                    </div>
                  )}
                </div>

                {error && <p className="text-red-400 text-xs mt-3">{error}</p>}

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 py-2 bg-forest-600 text-white text-sm font-medium rounded-lg hover:bg-forest-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? "Saving…" : creating ? "Add Shopper" : "Save Changes"}
                  </button>
                  <button onClick={closeForm} className="px-3 py-2 bg-gray-800 text-gray-300 text-sm rounded-lg hover:bg-gray-700 transition-colors">
                    Cancel
                  </button>
                </div>

                {editing && (
                  <div className="mt-3">
                    {deleteConfirm === editing.id ? (
                      <div className="flex gap-2">
                        <button onClick={() => handleDelete(editing.id)} className="flex-1 py-2 bg-red-700 text-white text-xs font-medium rounded-lg hover:bg-red-600">Confirm Delete</button>
                        <button onClick={() => setDeleteConfirm(null)} className="px-3 py-2 bg-gray-800 text-gray-400 text-xs rounded-lg hover:bg-gray-700">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(editing.id)} className="w-full py-2 text-xs text-red-500 hover:text-red-400 transition-colors">
                        Delete shopper
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TenantCombobox({
  value,
  onChange,
  tenants,
}: {
  value: string;
  onChange: (id: string) => void;
  tenants: Tenant[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const active = tenants.filter(t => !t.isArchived).sort((a, b) => a.name.localeCompare(b.name));
  const selected = active.find(t => t.id === value);

  const filtered = query.trim()
    ? active.filter(t => t.name.toLowerCase().includes(query.toLowerCase()))
    : active;

  return (
    <div className="relative">
      <input
        className={inputCls}
        value={open ? query : (selected?.name ?? "")}
        placeholder="Search projects…"
        onFocus={() => { setOpen(true); setQuery(""); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => setQuery(e.target.value)}
      />
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-52 overflow-y-auto">
          <div
            className="px-3 py-2 text-sm text-gray-400 hover:bg-gray-700 cursor-pointer"
            onMouseDown={() => { onChange(""); setOpen(false); setQuery(""); }}
          >
            — none —
          </div>
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">No matches</div>
          ) : filtered.map(t => (
            <div
              key={t.id}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-700 flex items-center justify-between gap-2 ${t.id === value ? "text-forest-400" : "text-gray-100"}`}
              onMouseDown={() => { onChange(t.id); setOpen(false); setQuery(""); }}
            >
              <span>{t.name}</span>
              {t.isConsignmentOnly && (
                <span className="text-xs text-gray-500 flex-shrink-0">Consignment</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full bg-gray-800 border border-gray-700 text-gray-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent placeholder-gray-600";
