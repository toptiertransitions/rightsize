"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useUser } from "@clerk/nextjs";
import type { Item, LocalVendor } from "@/lib/types";

const VENDOR_TYPES = ["Consignment Store", "Donation Org", "Junk Hauler"];

interface VendorFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItems: Item[];
  localVendors: LocalVendor[];
  tenantId?: string;
  onSent: (updatedItems: Item[]) => void;
}

export function VendorFileModal({
  isOpen,
  onClose,
  selectedItems,
  localVendors,
  tenantId,
  onSent,
}: VendorFileModalProps) {
  const { user } = useUser();
  const [vendorId, setVendorId] = useState("");
  const [ccEmail, setCcEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  // Pre-fill CC with current user's email
  useEffect(() => {
    if (user?.primaryEmailAddress?.emailAddress) {
      setCcEmail(user.primaryEmailAddress.emailAddress);
    }
  }, [user]);

  // Pre-select vendor if all selected items share the same assignedVendorId
  useEffect(() => {
    if (!isOpen) return;
    const ids = [...new Set(selectedItems.map((i) => i.assignedVendorId).filter(Boolean))];
    if (ids.length === 1) setVendorId(ids[0]!);
    else setVendorId("");
    setSent(false);
    setError("");
  }, [isOpen, selectedItems]);

  if (!isOpen) return null;

  const eligibleVendors = localVendors.filter((v) => v.isActive && VENDOR_TYPES.includes(v.vendorType));
  const selectedVendor = eligibleVendors.find((v) => v.id === vendorId);

  const handleSend = async () => {
    if (!vendorId) { setError("Please select a vendor."); return; }
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/vendor-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemIds: selectedItems.map((i) => i.id),
          vendorId,
          ccEmail: ccEmail.trim() || undefined,
          tenantId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setSent(true);
      if (data.items) onSent(data.items);
      setTimeout(onClose, 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Generate Vendor File</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Creates a branded PDF and emails it to the vendor with a portal link.
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {sent ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="w-14 h-14 bg-forest-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Sent!</h3>
            <p className="text-sm text-gray-500">
              PDF emailed to <span className="font-medium">{selectedVendor?.email}</span>
              {ccEmail && <> with CC to <span className="font-medium">{ccEmail}</span></>}.
            </p>
          </div>
        ) : (
          <>
            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Vendor selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Send To Vendor
                </label>
                {eligibleVendors.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No active vendors of type Consignment Store, Donation Org, or Junk Hauler found.</p>
                ) : (
                  <select
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
                  >
                    <option value="">— Select vendor —</option>
                    {eligibleVendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.vendorName} ({v.vendorType})
                      </option>
                    ))}
                  </select>
                )}
                {selectedVendor?.email && (
                  <p className="text-xs text-gray-400 mt-1.5">
                    PDF + portal link will be sent to <span className="font-medium text-gray-600">{selectedVendor.email}</span>
                  </p>
                )}
              </div>

              {/* CC email */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  CC (optional)
                </label>
                <input
                  type="email"
                  value={ccEmail}
                  onChange={(e) => setCcEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
                />
              </div>

              {/* Item list */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Items ({selectedItems.length})
                </label>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {selectedItems.map((item) => {
                    const photoUrl = item.photos?.[0]?.url || item.photoUrl;
                    return (
                      <div key={item.id} className="flex items-center gap-3 py-1.5">
                        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                          {photoUrl ? (
                            <div className="relative w-10 h-10">
                              <Image src={photoUrl} alt={item.itemName} fill className="object-cover" />
                            </div>
                          ) : (
                            <div className="w-10 h-10 flex items-center justify-center text-gray-300">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.itemName}</p>
                          <p className="text-xs text-gray-400">
                            {item.category}{item.valueMid > 0 ? ` · $${item.valueMid.toLocaleString()}` : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !vendorId}
                className="flex-1 py-2.5 rounded-xl bg-forest-600 text-white text-sm font-semibold hover:bg-forest-700 disabled:opacity-50 transition-colors"
              >
                {sending ? "Sending…" : "Send Vendor File"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
