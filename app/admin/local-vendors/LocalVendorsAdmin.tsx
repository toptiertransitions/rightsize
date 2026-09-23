"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminHeader } from "../components/AdminHeader";
import { Pagination } from "../components/Pagination";
import { OtherConsignmentClient } from "./OtherConsignmentClient";

const PAGE_SIZE = 25;
import { VENDOR_TYPES, ITEM_CATEGORIES, PARTNER_CATEGORIES } from "@/lib/types";
import type { LocalVendor, VendorType, Item, PartnerCategory } from "@/lib/types";

// ─── Type badge colors ────────────────────────────────────────────────────────
const TYPE_COLORS: Record<VendorType, string> = {
  "Move Manager": "bg-purple-900/40 text-purple-300",
  "Mover": "bg-blue-900/40 text-blue-300",
  "Future Home/Community": "bg-green-900/40 text-green-300",
  "Realtor": "bg-teal-900/40 text-teal-300",
  "Broker": "bg-yellow-900/40 text-yellow-300",
  "Donation Org": "bg-orange-900/40 text-orange-300",
  "Consignment Store": "bg-amber-900/40 text-amber-300",
  "Collector/Reseller": "bg-indigo-900/40 text-indigo-300",
  "Junk Hauler": "bg-gray-700/40 text-gray-300",
  "Attorney": "bg-red-900/40 text-red-300",
  "Other": "bg-gray-700/40 text-gray-300",
};

// ─── LocalVendorModal ─────────────────────────────────────────────────────────
interface ModalProps {
  vendor?: LocalVendor;
  onClose: () => void;
  onSaved: () => void;
}

function LocalVendorModal({ vendor, onClose, onSaved }: ModalProps) {
  const isEdit = !!vendor;
  const [vendorType, setVendorType] = useState<VendorType>(vendor?.vendorType ?? "Other");
  const [vendorName, setVendorName] = useState(vendor?.vendorName ?? "");
  const [pocName, setPocName] = useState(vendor?.pocName ?? "");
  const [email, setEmail] = useState(vendor?.email ?? "");
  const [phone, setPhone] = useState(vendor?.phone ?? "");
  const [address, setAddress] = useState(vendor?.address ?? "");
  const [city, setCity] = useState(vendor?.city ?? "");
  const [state, setState] = useState(vendor?.state ?? "");
  const [zip, setZip] = useState(vendor?.zip ?? "");
  const [website, setWebsite] = useState(vendor?.website ?? "");
  const [itemCategories, setItemCategories] = useState(vendor?.itemCategories ?? "");
  const [consignmentTake, setConsignmentTake] = useState(vendor?.consignmentTake ?? 0);
  const [zipCodesServed, setZipCodesServed] = useState(vendor?.zipCodesServed ?? "");
  const [notes, setNotes] = useState(vendor?.notes ?? "");
  const [isActive, setIsActive] = useState(vendor?.isActive ?? true);
  // Partners marketplace fields
  const [category, setCategory] = useState<PartnerCategory | "">(vendor?.category ?? "");
  const [logo, setLogo] = useState(vendor?.logo ?? "");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [aboutUs, setAboutUs] = useState(vendor?.aboutUs ?? "");
  const [featuredRank, setFeaturedRank] = useState(vendor?.featuredRank !== undefined ? String(vendor.featuredRank) : "");
  const [projectsAdjustment, setProjectsAdjustment] = useState(String(vendor?.projectsCompletedAdjustment ?? 0));
  const [prefSlots, setPrefSlots] = useState<Array<{ category: string; minPrice: string; maxPrice: string }>>(() => {
    const slots = (vendor?.prefCategories ?? []).map(p => ({
      category: p.category,
      minPrice: p.minPrice > 0 ? String(p.minPrice) : "",
      maxPrice: p.maxPrice > 0 ? String(p.maxPrice) : "",
    }));
    while (slots.length < 5) slots.push({ category: "", minPrice: "", maxPrice: "" });
    return slots;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ msg: string; ok: boolean } | null>(null);

  const handleSendInvite = async () => {
    if (!vendor) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId: vendor.id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Failed to send invite");
      setInviteMsg({ msg: `Login link sent to ${vendor.email}`, ok: true });
    } catch (e) {
      setInviteMsg({ msg: e instanceof Error ? e.message : "Error sending invite", ok: false });
    } finally {
      setInviting(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file after an error
    if (!file) return;
    setLogoUploading(true);
    setLogoError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setLogo(data.photoUrl);
    } catch (e) {
      setLogoError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleSave = async () => {
    if (!vendorName.trim()) { setError("Vendor name is required"); return; }
    setLoading(true);
    setError("");
    try {
      const prefCategories = prefSlots
        .filter(s => s.category.trim())
        .map(s => ({
          category: s.category,
          minPrice: s.minPrice ? parseFloat(s.minPrice) || 0 : 0,
          maxPrice: s.maxPrice ? parseFloat(s.maxPrice) || 0 : 0,
        }));
      const base = {
        vendorType, vendorName: vendorName.trim(), pocName: pocName.trim(),
        email: email.trim(), phone: phone.trim(), address: address.trim(),
        city: city.trim(), state: state.trim().toUpperCase(), zip: zip.trim(),
        website: website.trim(), itemCategories: itemCategories.trim(),
        consignmentTake: Number(consignmentTake) || 0,
        zipCodesServed: zipCodesServed.trim(), notes: notes.trim(), isActive,
        prefCategories,
        category: category || undefined,
        logo: logo.trim(),
        featuredRank: featuredRank.trim() ? Number(featuredRank) : null,
        projectsCompletedAdjustment: Number(projectsAdjustment) || 0,
        aboutUs: aboutUs.trim(),
      };
      const payload = isEdit ? { id: vendor.id, ...base } : base;
      const res = await fetch("/api/local-vendors", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...(!isEdit && { "x-vendor-source": "Admin Vendor Directory" }) },
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
      const res = await fetch(`/api/local-vendors?id=${vendor.id}`, { method: "DELETE" });
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
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-bold text-white">
            {isEdit ? "Edit Local Vendor" : "Add Local Vendor"}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-400"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Active toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">Active (visible to clients)</label>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isActive ? "bg-forest-600" : "bg-gray-600"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isActive ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          {/* Vendor Type */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Vendor Type</label>
            <select
              value={vendorType}
              onChange={(e) => setVendorType(e.target.value as VendorType)}
              className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400"
            >
              {VENDOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Vendor Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Vendor Name *</label>
            <input
              type="text"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="e.g. Denver Consignment Co."
              className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400"
            />
          </div>

          {/* POC */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Point of Contact</label>
            <input type="text" value={pocName} onChange={(e) => setPocName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400" />
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@example.com"
                className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 555-5555"
                className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400" />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Street Address</label>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St"
              className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400" />
          </div>

          {/* City / State / Zip */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-300 mb-1.5">City</label>
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)}
                placeholder="Denver"
                className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">State</label>
              <input type="text" value={state} onChange={(e) => setState(e.target.value)}
                placeholder="CO" maxLength={2}
                className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400 uppercase" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Zip</label>
              <input type="text" value={zip} onChange={(e) => setZip(e.target.value)}
                placeholder="80202"
                className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400" />
            </div>
          </div>

          {/* Website */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Website</label>
            <input type="text" value={website} onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400" />
          </div>

          {/* Item Categories */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Item Categories (comma-separated)</label>
            <input type="text" value={itemCategories} onChange={(e) => setItemCategories(e.target.value)}
              placeholder="Furniture, Art, Jewelry"
              className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400" />
          </div>

          {/* Consignment Take */}
          {(vendorType === "Consignment Store" || vendorType === "Collector/Reseller") && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Consignment Take (%)</label>
              <input type="number" min={0} max={100} value={consignmentTake}
                onChange={(e) => setConsignmentTake(Number(e.target.value))}
                className="w-32 h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400" />
            </div>
          )}

          {/* Zip Codes Served */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Zip Codes Served (comma-separated)</label>
            <input type="text" value={zipCodesServed} onChange={(e) => setZipCodesServed(e.target.value)}
              placeholder="80202, 80203, 80204"
              className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400" />
          </div>

          {/* Partners marketplace fields */}
          <div className="border-t border-gray-700 pt-4 space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Client-Facing Partners Page</p>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Partner Category</label>
              <p className="text-xs text-gray-500 mb-1.5">Only vendors with a category set appear on the client-facing Partners page.</p>
              <select value={category} onChange={(e) => setCategory(e.target.value as PartnerCategory | "")}
                className="w-full h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400">
                <option value="">— Not shown on Partners page —</option>
                {PARTNER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Logo</label>
              <div className="flex items-center gap-3">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logo}
                    alt="Vendor logo"
                    className="w-14 h-14 object-contain rounded-lg border border-gray-700 bg-white p-1.5"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg border border-dashed border-gray-600 flex items-center justify-center text-gray-600 text-[10px] text-center px-1">
                    No logo
                  </div>
                )}
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <span className="px-4 py-2 rounded-xl border border-gray-600 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:border-gray-500 transition-colors">
                    {logoUploading ? "Uploading…" : logo ? "Replace Logo" : "Upload Logo"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                    disabled={logoUploading}
                  />
                </label>
                {logo && !logoUploading && (
                  <button
                    type="button"
                    onClick={() => setLogo("")}
                    className="text-xs text-gray-500 hover:text-red-400"
                  >
                    Remove
                  </button>
                )}
              </div>
              {logoError && <p className="text-xs text-red-400 mt-1.5">{logoError}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">About Us</label>
              <p className="text-xs text-gray-500 mb-1.5">Shown in the "Learn More" popup on the client-facing Partners page.</p>
              <textarea value={aboutUs} onChange={(e) => setAboutUs(e.target.value)}
                rows={4}
                placeholder="A short paragraph introducing this partner to clients…"
                className="w-full px-3 py-2 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400 resize-y" />
            </div>
            <div className="flex gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Featured Rank</label>
                <p className="text-xs text-gray-500 mb-1.5">Lower shows first. Leave blank for normal ranking.</p>
                <input type="number" value={featuredRank} onChange={(e) => setFeaturedRank(e.target.value)}
                  placeholder="e.g. 1"
                  className="w-32 h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Projects Completed Adjustment</label>
                <p className="text-xs text-gray-500 mb-1.5">Manual +/- on top of the auto-computed count.</p>
                <input type="number" value={projectsAdjustment} onChange={(e) => setProjectsAdjustment(e.target.value)}
                  className="w-32 h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400" />
              </div>
            </div>
          </div>

          {/* Item Category Preferences */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Item Category Preferences</label>
            <p className="text-xs text-gray-500 mb-2">Vendor will only receive items matching these slots. Leave blank to accept any.</p>
            <div className="space-y-2">
              {prefSlots.map((slot, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select
                    value={slot.category}
                    onChange={e => { const next = [...prefSlots]; next[i] = { ...next[i], category: e.target.value }; setPrefSlots(next); }}
                    className="flex-1 h-9 px-2 rounded-lg border border-gray-600 text-xs bg-gray-800 text-white focus:outline-none focus:ring-1 focus:ring-forest-400"
                  >
                    <option value="">— Any —</option>
                    {ITEM_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  {slot.category && (
                    <>
                      <input
                        type="number" min="0" placeholder="Min $" value={slot.minPrice}
                        onChange={e => { const next = [...prefSlots]; next[i] = { ...next[i], minPrice: e.target.value }; setPrefSlots(next); }}
                        className="w-20 h-9 px-2 rounded-lg border border-gray-600 text-xs bg-gray-800 text-white focus:outline-none focus:ring-1 focus:ring-forest-400"
                      />
                      <input
                        type="number" min="0" placeholder="Max $" value={slot.maxPrice}
                        onChange={e => { const next = [...prefSlots]; next[i] = { ...next[i], maxPrice: e.target.value }; setPrefSlots(next); }}
                        className="w-20 h-9 px-2 rounded-lg border border-gray-600 text-xs bg-gray-800 text-white focus:outline-none focus:ring-1 focus:ring-forest-400"
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Portal Access (edit only) */}
          {isEdit && (
            <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-medium text-gray-300">Portal Access</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {vendor?.clerkUserId
                      ? "Vendor has an active portal account"
                      : "Vendor has not set up portal access yet"}
                  </p>
                </div>
                <span className={`flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                  vendor?.clerkUserId ? "bg-green-900/40 text-green-300" : "bg-gray-700/60 text-gray-400"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${vendor?.clerkUserId ? "bg-green-400" : "bg-gray-500"}`} />
                  {vendor?.clerkUserId ? "Active" : "Not linked"}
                </span>
              </div>
              <button
                type="button"
                onClick={handleSendInvite}
                disabled={inviting || !vendor?.email}
                title={!vendor?.email ? "Add an email address first to send a login link" : undefined}
                className="text-sm text-forest-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed border border-gray-600 whitespace-nowrap"
              >
                {inviting ? "Sending…" : vendor?.clerkUserId ? "Re-send Login Link" : "Send Login Link"}
              </button>
              {inviteMsg && (
                <p className={`text-xs mt-2 ${inviteMsg.ok ? "text-green-400" : "text-red-400"}`}>
                  {inviteMsg.msg}
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Internal Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={3} placeholder="Internal TTT notes..."
              className="w-full px-3 py-2 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-forest-400 resize-none" />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="px-6 py-4 flex gap-3 border-t border-gray-700 flex-shrink-0">
          {isEdit && !confirmDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={loading}
              className="h-10 px-4 rounded-xl border border-red-700 text-red-400 text-sm font-medium hover:bg-red-900/30 transition-colors disabled:opacity-50"
            >
              Delete
            </button>
          )}
          {isEdit && confirmDelete && (
            <button
              onClick={handleDelete}
              disabled={loading}
              className="h-10 px-4 rounded-xl bg-red-700 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              Yes, Delete
            </button>
          )}
          <button
            onClick={confirmDelete ? () => setConfirmDelete(false) : onClose}
            disabled={loading}
            className="flex-1 h-10 rounded-xl border border-gray-600 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          {!confirmDelete && (
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 h-10 rounded-xl bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 transition-colors disabled:opacity-50"
            >
              {loading ? "Saving…" : isEdit ? "Save Changes" : "Add Vendor"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
interface LocalVendorsAdminProps {
  vendors: LocalVendor[];
  consignmentItems: Item[];
  tenantInfoMap: Record<string, { name: string; ownerEmail: string; isTTT: boolean }>;
}

export function LocalVendorsAdmin({ vendors: initialVendors, consignmentItems, tenantInfoMap }: LocalVendorsAdminProps) {
  const router = useRouter();
  const [stateFilter, setStateFilter] = useState("");
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editVendor, setEditVendor] = useState<LocalVendor | undefined>(undefined);
  const [sortCol, setSortCol] = useState<string>("vendorType");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteMsg, setInviteMsg] = useState<{ vendorId: string; msg: string; ok: boolean } | null>(null);

  const sendPortalInvite = async (vendor: LocalVendor) => {
    setInvitingId(vendor.id);
    setInviteMsg(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId: vendor.id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Failed to send invite");
      setInviteMsg({ vendorId: vendor.id, msg: "Invite sent!", ok: true });
    } catch (e) {
      setInviteMsg({ vendorId: vendor.id, msg: e instanceof Error ? e.message : "Error", ok: false });
    } finally {
      setInvitingId(null);
    }
  };

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const sortTh = (col: string, label: string) => (
    <th
      onClick={() => handleSort(col)}
      className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-200 transition-colors"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="text-[9px]">{sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span>
      </span>
    </th>
  );

  const stateFiltered = stateFilter
    ? initialVendors.filter((v) => v.state.toUpperCase() === stateFilter.toUpperCase())
    : initialVendors;

  const filtered = [...stateFiltered].sort((a, b) => {
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
      case "isActive":        av = a.isActive ? 0 : 1; bv = b.isActive ? 0 : 1; break;
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const states = Array.from(new Set(initialVendors.map((v) => v.state).filter(Boolean))).sort();

  const openAdd = () => { setEditVendor(undefined); setShowModal(true); };
  const openEdit = (v: LocalVendor) => { setEditVendor(v); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditVendor(undefined); };
  const onSaved = () => { closeModal(); router.refresh(); };

  return (
    <div className="min-h-screen bg-gray-950">
      <AdminHeader active="local-vendors" />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Local Vendor Directory</h1>
            <p className="text-gray-400 mt-1">{initialVendors.length} vendor{initialVendors.length !== 1 ? "s" : ""} total</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={stateFilter}
              onChange={(e) => { setStateFilter(e.target.value); setPage(1); }}
              className="h-10 px-3 rounded-xl border border-gray-600 text-sm bg-gray-800 text-white focus:outline-none"
            >
              <option value="">All States</option>
              {states.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
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
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p>No vendors{stateFilter ? ` in ${stateFilter}` : ""} yet.</p>
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-700 rounded-2xl overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  {sortTh("vendorType", "Type")}
                  {sortTh("vendorName", "Name")}
                  {sortTh("location", "City, State")}
                  {sortTh("pocName", "POC")}
                  {sortTh("email", "Email")}
                  {sortTh("phone", "Phone")}
                  {sortTh("itemCategories", "Item Categories")}
                  {sortTh("consignmentTake", "Take")}
                  {sortTh("zipCodesServed", "Zips Served")}
                  {sortTh("isActive", "Active")}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Preferences</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Portal</th>
                  <th className="sticky right-0 bg-gray-900 px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-l border-gray-700"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((v, i) => (
                  <tr
                    key={v.id}
                    className={`border-b border-gray-800 group ${i % 2 === 0 ? "" : "bg-gray-800/20"}`}
                  >
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[v.vendorType]}`}>
                        {v.vendorType}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-white">{v.vendorName}</td>
                    <td className="px-4 py-3 text-gray-300">
                      {[v.city, v.state].filter(Boolean).join(", ")}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{v.pocName || "—"}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {v.email ? (
                        <a href={`mailto:${v.email}`} className="hover:text-forest-400 truncate block max-w-[160px]">{v.email}</a>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{v.phone || "—"}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {v.itemCategories ? (
                        <span className="truncate block max-w-[140px]" title={v.itemCategories}>{v.itemCategories}</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {v.consignmentTake > 0 ? `${v.consignmentTake}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {v.zipCodesServed ? (
                        <span className="truncate block max-w-[120px]" title={v.zipCodesServed}>{v.zipCodesServed}</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block w-2 h-2 rounded-full ${v.isActive ? "bg-green-400" : "bg-gray-600"}`} />
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {v.prefCategories.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {v.prefCategories.map((p, i) => (
                            <span key={i} className="text-xs whitespace-nowrap">
                              {p.category}
                              {(p.minPrice > 0 || p.maxPrice > 0) && (
                                <span className="text-gray-500 ml-1">
                                  {p.minPrice > 0 ? `$${p.minPrice}` : ""}
                                  {p.minPrice > 0 && p.maxPrice > 0 ? "–" : ""}
                                  {p.maxPrice > 0 ? `$${p.maxPrice}` : "+"}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      ) : <span className="text-gray-600">Any</span>}
                    </td>
                    <td className="px-4 py-3">
                      {v.clerkUserId ? (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full bg-green-400" />
                          <span className="text-xs text-green-400">Active</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => sendPortalInvite(v)}
                            disabled={invitingId === v.id || !v.email}
                            title={!v.email ? "Vendor has no email" : "Invite to Vendor Portal"}
                            className="text-xs text-forest-400 hover:text-white px-2 py-1 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            {invitingId === v.id ? "Sending…" : "Invite to Portal"}
                          </button>
                          {inviteMsg?.vendorId === v.id && (
                            <span className={`text-[10px] ${inviteMsg.ok ? "text-green-400" : "text-red-400"}`}>
                              {inviteMsg.msg}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className={`sticky right-0 px-4 py-3 border-l border-gray-700 ${i % 2 === 0 ? "bg-gray-900" : "bg-[#171f2e]"}`}>
                      <button
                        onClick={() => openEdit(v)}
                        className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination currentPage={page} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </div>
        )}
      </main>

      {/* ─── Other Consignment Items ─────────────────────────────────────── */}
      <div className="mt-12 mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-xl font-bold text-white">Other Consignment Store Items</h2>
          <span className="text-xs bg-amber-900/40 text-amber-300 border border-amber-700/50 px-2 py-0.5 rounded-full font-medium">
            {consignmentItems.length} item{consignmentItems.length !== 1 ? "s" : ""}
          </span>
        </div>
        <p className="text-gray-400 text-sm mb-6">
          All client items routed to Other Consignment Store. Assign vendors, track responses, and manage payouts inline.
        </p>
        <OtherConsignmentClient
          items={consignmentItems}
          tenantInfoMap={tenantInfoMap}
          vendors={initialVendors}
        />
      </div>

      {showModal && (
        <LocalVendorModal
          vendor={editVendor}
          onClose={closeModal}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
