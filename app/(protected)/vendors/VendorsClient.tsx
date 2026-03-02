"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VENDOR_TYPES } from "@/lib/types";
import type { Vendor, VendorType, LocalVendor } from "@/lib/types";

// ─── Type badge colors ──────────────────────────────────────────────────────
const TYPE_COLORS: Record<VendorType, string> = {
  "Move Manager": "bg-purple-100 text-purple-800",
  "Mover": "bg-blue-100 text-blue-800",
  "Future Home/Community": "bg-green-100 text-green-800",
  "Realtor": "bg-teal-100 text-teal-800",
  "Broker": "bg-yellow-100 text-yellow-800",
  "Donation Org": "bg-orange-100 text-orange-800",
  "Consignment Store": "bg-orange-100 text-orange-800",
  "Junk Hauler": "bg-gray-100 text-gray-700",
  "Attorney": "bg-red-100 text-red-800",
  "Other": "bg-gray-100 text-gray-700",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string): string {
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`;
}

function isUpcoming(iso: string): boolean {
  if (!iso) return false;
  return iso >= new Date().toISOString().slice(0, 10);
}

// ─── VendorModal ─────────────────────────────────────────────────────────────
interface VendorPrefill {
  vendorType?: VendorType;
  vendorName?: string;
  pocName?: string;
  email?: string;
  phone?: string;
}

interface ModalProps {
  tenantId: string;
  vendor?: Vendor;
  prefill?: VendorPrefill;
  onClose: () => void;
  onSaved: () => void;
}

function VendorModal({ tenantId, vendor, prefill, onClose, onSaved }: ModalProps) {
  const isEdit = !!vendor;
  const [vendorType, setVendorType] = useState<VendorType>(vendor?.vendorType ?? prefill?.vendorType ?? "Mover");
  const [vendorName, setVendorName] = useState(vendor?.vendorName ?? prefill?.vendorName ?? "");
  const [pocName, setPocName] = useState(vendor?.pocName ?? prefill?.pocName ?? "");
  const [email, setEmail] = useState(vendor?.email ?? prefill?.email ?? "");
  const [phone, setPhone] = useState(vendor?.phone ?? prefill?.phone ?? "");
  const [arrangement, setArrangement] = useState(vendor?.arrangement ?? "");
  const [date1Label, setDate1Label] = useState(vendor?.date1Label ?? "");
  const [date1, setDate1] = useState(vendor?.date1 ?? "");
  const [date2Label, setDate2Label] = useState(vendor?.date2Label ?? "");
  const [date2, setDate2] = useState(vendor?.date2 ?? "");
  const [date3Label, setDate3Label] = useState(vendor?.date3Label ?? "");
  const [date3, setDate3] = useState(vendor?.date3 ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!vendorName.trim()) { setError("Vendor name is required"); return; }
    if (!email.trim()) { setError("Email is required"); return; }
    setLoading(true);
    setError("");
    try {
      const payload = isEdit
        ? {
            id: vendor.id,
            vendorType, vendorName: vendorName.trim(), pocName: pocName.trim(),
            email: email.trim(), phone: phone.trim(), arrangement: arrangement.trim(),
            date1Label: date1Label.trim(), date1,
            date2Label: date2Label.trim(), date2,
            date3Label: date3Label.trim(), date3,
          }
        : {
            tenantId, vendorType, vendorName: vendorName.trim(), pocName: pocName.trim(),
            email: email.trim(), phone: phone.trim(), arrangement: arrangement.trim(),
            date1Label: date1Label.trim(), date1,
            date2Label: date2Label.trim(), date2,
            date3Label: date3Label.trim(), date3,
          };
      const res = await fetch("/api/vendors", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let msg = "Failed to save";
        try { const d = await res.json(); msg = d.error ?? msg; } catch {}
        throw new Error(msg);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error saving");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!vendor) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/vendors?id=${vendor.id}`, { method: "DELETE" });
      if (!res.ok) {
        let msg = "Failed to delete";
        try { const d = await res.json(); msg = d.error ?? msg; } catch {}
        throw new Error(msg);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error deleting");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-cream-100 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? "Edit Vendor" : "Add Vendor"}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Vendor Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Vendor Type</label>
            <select
              value={vendorType}
              onChange={(e) => setVendorType(e.target.value as VendorType)}
              className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400 bg-white"
            >
              {VENDOR_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Vendor Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Vendor Name</label>
            <input
              type="text"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="e.g. ABC Moving Co."
              className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400"
            />
          </div>

          {/* POC Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Point of Contact (optional)</label>
            <input
              type="text"
              value={pocName}
              onChange={(e) => setPocName(e.target.value)}
              placeholder="e.g. Jane Smith"
              className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@example.com"
              className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone (optional)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 555-5555"
              className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400"
            />
          </div>

          {/* Arrangement */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Arrangement Notes (optional)</label>
            <textarea
              value={arrangement}
              onChange={(e) => setArrangement(e.target.value)}
              rows={3}
              placeholder="Notes on the deal or engagement..."
              className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400 resize-none"
            />
          </div>

          {/* Key Dates */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Key Dates (optional)</label>
            <div className="space-y-2">
              {([
                [date1Label, setDate1Label, date1, setDate1, "e.g. Move Day"],
                [date2Label, setDate2Label, date2, setDate2, "e.g. Closing"],
                [date3Label, setDate3Label, date3, setDate3, "e.g. Donation Pickup"],
              ] as const).map((row, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={row[0] as string}
                    onChange={(e) => (row[1] as (v: string) => void)(e.target.value)}
                    placeholder={row[4] as string}
                    className="flex-1 h-10 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400"
                  />
                  <input
                    type="date"
                    value={row[2] as string}
                    onChange={(e) => (row[3] as (v: string) => void)(e.target.value)}
                    className="w-40 h-10 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400"
                  />
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="px-6 py-4 flex gap-3 border-t border-cream-100 flex-shrink-0">
          {isEdit && (
            <button
              onClick={handleDelete}
              disabled={loading}
              className="h-11 px-4 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              Delete
            </button>
          )}
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 h-11 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 h-11 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors disabled:opacity-50"
          >
            {loading ? "Saving…" : isEdit ? "Save Changes" : "Add Vendor"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── VendorCard ────────────────────────────────────────────────────────────────
function VendorCard({
  vendor,
  canEdit,
  onEdit,
}: {
  vendor: Vendor;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const typeColor = TYPE_COLORS[vendor.vendorType] ?? "bg-gray-100 text-gray-700";
  const dates = [
    { label: vendor.date1Label, value: vendor.date1 },
    { label: vendor.date2Label, value: vendor.date2 },
    { label: vendor.date3Label, value: vendor.date3 },
  ].filter((d) => d.value);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-3 relative">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <span className="font-bold text-gray-900 text-base leading-tight">{vendor.vendorName}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeColor}`}>
            {vendor.vendorType}
          </span>
          {canEdit && (
            <button
              onClick={onEdit}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Edit vendor"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* POC */}
      {vendor.pocName && (
        <p className="text-sm text-gray-400">{vendor.pocName}</p>
      )}

      {/* Contact */}
      <div className="flex flex-wrap gap-3">
        {vendor.email && (
          <a
            href={`mailto:${vendor.email}`}
            className="flex items-center gap-1.5 text-sm text-forest-600 hover:text-forest-700 hover:underline"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {vendor.email}
          </a>
        )}
        {vendor.phone && (
          <a
            href={`tel:${vendor.phone}`}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 hover:underline"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            {vendor.phone}
          </a>
        )}
      </div>

      {/* Arrangement */}
      {vendor.arrangement && (
        <p className="text-sm text-gray-600 line-clamp-3">{vendor.arrangement}</p>
      )}

      {/* Key Dates */}
      {dates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {dates.map((d, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
                isUpcoming(d.value)
                  ? "bg-forest-50 text-forest-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {d.label && <span className="font-semibold">{d.label}:</span>}
              {formatDate(d.value)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── LocalVendorDirectory ─────────────────────────────────────────────────────
const LOCAL_TYPE_ORDER: VendorType[] = [
  "Consignment Store",
  "Donation Org",
  "Mover",
  "Move Manager",
  "Junk Hauler",
  "Future Home/Community",
  "Realtor",
  "Broker",
  "Attorney",
  "Other",
];

function LocalVendorDirectory({
  vendors,
  onSelect,
}: {
  vendors: LocalVendor[];
  onSelect?: (v: LocalVendor) => void;
}) {
  const [sortCol, setSortCol] = useState<string>("vendorType");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  if (vendors.length === 0) return null;

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const displayVendors = [...vendors].sort((a, b) => {
    let av: string | number = "";
    let bv: string | number = "";
    switch (sortCol) {
      case "vendorType":      av = a.vendorType;       bv = b.vendorType;       break;
      case "vendorName":      av = a.vendorName.toLowerCase(); bv = b.vendorName.toLowerCase(); break;
      case "location":        av = `${a.city} ${a.state}`.toLowerCase(); bv = `${b.city} ${b.state}`.toLowerCase(); break;
      case "pocName":         av = a.pocName.toLowerCase(); bv = b.pocName.toLowerCase(); break;
      case "email":           av = a.email.toLowerCase(); bv = b.email.toLowerCase(); break;
      case "phone":           av = a.phone;            bv = b.phone;            break;
      case "itemCategories":  av = a.itemCategories.toLowerCase(); bv = b.itemCategories.toLowerCase(); break;
      case "consignmentTake": av = a.consignmentTake;  bv = b.consignmentTake;  break;
      case "zipCodesServed":  av = a.zipCodesServed;   bv = b.zipCodesServed;   break;
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const sortTh = (col: string, label: string, extraClass = "") => (
    <th
      onClick={() => handleSort(col)}
      className={`px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-600 transition-colors ${extraClass}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="text-[9px]">{sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span>
      </span>
    </th>
  );

  return (
    <div className="mt-10">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-bold text-gray-900">Local Vendor Directory</h2>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">Managed by TTT</span>
      </div>
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {onSelect && <th className="px-3 py-2.5" />}
              {sortTh("vendorType", "Type")}
              {sortTh("vendorName", "Name")}
              {sortTh("location", "City, State")}
              {sortTh("pocName", "POC")}
              {sortTh("email", "Email")}
              {sortTh("phone", "Phone")}
              {sortTh("itemCategories", "Item Categories", "hidden lg:table-cell")}
              {sortTh("consignmentTake", "Take", "hidden lg:table-cell")}
              {sortTh("zipCodesServed", "Zips Served", "hidden xl:table-cell")}
            </tr>
          </thead>
          <tbody>
            {displayVendors.map((v, i) => {
                const typeColor = TYPE_COLORS[v.vendorType] ?? "bg-gray-100 text-gray-700";
                return (
                  <tr key={v.id} className={`border-b border-gray-100 ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}>
                    {onSelect && (
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => onSelect(v)}
                          className="h-7 px-2.5 rounded-lg bg-forest-50 text-forest-700 text-xs font-medium hover:bg-forest-100 transition-colors whitespace-nowrap"
                        >
                          Select
                        </button>
                      </td>
                    )}
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeColor}`}>
                        {v.vendorType}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{v.vendorName}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {[v.city, v.state].filter(Boolean).join(", ")}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{v.pocName || "—"}</td>
                    <td className="px-4 py-2.5">
                      {v.email
                        ? <a href={`mailto:${v.email}`} className="text-forest-600 hover:underline truncate block max-w-[160px]">{v.email}</a>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {v.phone
                        ? <a href={`tel:${v.phone}`} className="text-gray-600 hover:underline">{v.phone}</a>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-2.5 text-gray-500">
                      {v.itemCategories
                        ? <span className="truncate block max-w-[140px]" title={v.itemCategories}>{v.itemCategories}</span>
                        : "—"}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-2.5 text-gray-500">
                      {v.consignmentTake > 0 ? `${v.consignmentTake}% take` : "—"}
                    </td>
                    <td className="hidden xl:table-cell px-4 py-2.5 text-gray-500">
                      {v.zipCodesServed
                        ? <span className="truncate block max-w-[120px]" title={v.zipCodesServed}>{v.zipCodesServed}</span>
                        : "—"}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── VendorsClient ────────────────────────────────────────────────────────────
interface VendorsClientProps {
  vendors: Vendor[];
  tenantId: string;
  canEdit: boolean;
  localVendors: LocalVendor[];
}

export function VendorsClient({ vendors, tenantId, canEdit, localVendors }: VendorsClientProps) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | undefined>(undefined);
  const [prefill, setPrefill] = useState<VendorPrefill | undefined>(undefined);

  const openAdd = () => {
    setPrefill(undefined);
    setEditVendor(undefined);
    setShowModal(true);
  };

  const openEdit = (vendor: Vendor) => {
    setPrefill(undefined);
    setEditVendor(vendor);
    setShowModal(true);
  };

  const openFromDirectory = (v: LocalVendor) => {
    setPrefill({
      vendorType: v.vendorType,
      vendorName: v.vendorName,
      pocName: v.pocName,
      email: v.email,
      phone: v.phone,
    });
    setEditVendor(undefined);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditVendor(undefined);
    setPrefill(undefined);
  };

  const onSaved = () => {
    closeModal();
    router.refresh();
  };

  return (
    <>
      {/* Toolbar */}
      {canEdit && (
        <div className="flex justify-end mb-6">
          <button
            onClick={openAdd}
            className="h-10 px-4 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Vendor
          </button>
        </div>
      )}

      {/* Grid */}
      {vendors.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">No vendors yet</h3>
          <p className="text-sm text-gray-400 max-w-xs mx-auto">
            Add movers, realtors, donation orgs, attorneys, and other service providers here.
          </p>
          {canEdit && (
            <button
              onClick={openAdd}
              className="mt-5 h-10 px-5 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors"
            >
              Add your first vendor
            </button>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendors.map((vendor) => (
            <VendorCard
              key={vendor.id}
              vendor={vendor}
              canEdit={canEdit}
              onEdit={() => openEdit(vendor)}
            />
          ))}
        </div>
      )}

      {/* Local Vendor Directory */}
      <LocalVendorDirectory
        vendors={localVendors}
        onSelect={canEdit ? openFromDirectory : undefined}
      />

      {/* Modal */}
      {showModal && (
        <VendorModal
          tenantId={tenantId}
          vendor={editVendor}
          prefill={prefill}
          onClose={closeModal}
          onSaved={onSaved}
        />
      )}
    </>
  );
}

// Named export for potential use in other layouts
export function AddVendorButton({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="h-10 px-4 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Vendor
      </button>
      {showModal && (
        <VendorModal
          tenantId={tenantId}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); router.refresh(); }}
        />
      )}
    </>
  );
}
