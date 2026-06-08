"use client";
import { useState } from "react";
import type { Item, LocalVendor } from "@/lib/types";
import type { VendorAssignment } from "@/lib/vendorMapping";
import { MapToVendorsModal } from "./MapToVendorsModal";

interface Props {
  tenantId: string;
  projectCity: string;
  projectState: string;
  projectZip: string;
  eligibleItemCount: number;
  items: Item[];
  vendors: LocalVendor[];
  sentByClerkId: string;
  sentByName: string;
  sentByEmail: string;
}

export function MapToVendorsButton({
  tenantId, projectCity, projectState, projectZip,
  eligibleItemCount, items, vendors,
  sentByClerkId, sentByName, sentByEmail,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [assignments, setAssignments] = useState<VendorAssignment[] | null>(null);

  async function handleClick() {
    setLoading(true);
    setError("");
    try {
      const eligibleItems = items.filter(i =>
        ["FB/Marketplace", "Online Marketplace", "Other Consignment", "Donate", "Discard"].includes(i.primaryRoute) &&
        ["Pending Review", "Approved", "Listed"].includes(i.status) &&
        !i.vendorOutreachStatus &&
        i.primaryRoute !== "ProFoundFinds Consignment"
      );

      // Determine which vendor types are needed
      const needsConsignment = eligibleItems.some(i => !["Donate", "Discard"].includes(i.primaryRoute));
      const needsDonation = eligibleItems.some(i => i.primaryRoute === "Donate");
      const needsHauler = eligibleItems.some(i => i.primaryRoute === "Discard");

      const eligibleVendors = vendors.filter(v => {
        if (v.vendorType === "Consignment Store" && needsConsignment) return true;
        if (v.vendorType === "Donation Org" && needsDonation) return true;
        if (v.vendorType === "Junk Hauler" && needsHauler) return true;
        return false;
      });

      const res = await fetch("/api/catalog/map-to-vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectZip, items: eligibleItems, vendors: eligibleVendors }),
      });
      if (!res.ok) throw new Error("AI mapping failed");
      const data = await res.json();
      setAssignments(data.assignments);
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="text-center py-8 bg-gray-50 rounded-xl border border-gray-100">
        {eligibleItemCount > 0 ? (
          <>
            <div className="w-14 h-14 bg-[#2d4a3e]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-[#2d4a3e]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <p className="text-base font-medium text-gray-700 mb-4">
              {eligibleItemCount} item{eligibleItemCount !== 1 ? 's' : ''} ready for vendor outreach
            </p>
            <button
              onClick={handleClick}
              disabled={loading}
              className="min-h-[44px] min-w-[180px] bg-[#2d4a3e] text-white font-semibold rounded-xl px-6 text-sm hover:bg-[#1e3329] disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Finding best matches…
                </>
              ) : (
                `Map to Vendors · ${eligibleItemCount} items ready`
              )}
            </button>
          </>
        ) : (
          <button disabled
            className="min-h-[44px] min-w-[180px] bg-gray-200 text-gray-400 font-semibold rounded-xl px-6 text-sm cursor-not-allowed"
            title="No eligible items">
            No eligible items
          </button>
        )}
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </div>

      {assignments && (
        <MapToVendorsModal
          tenantId={tenantId}
          projectCity={projectCity}
          projectState={projectState}
          projectZip={projectZip}
          assignments={assignments}
          items={items}
          vendors={vendors}
          sentByClerkId={sentByClerkId}
          sentByName={sentByName}
          sentByEmail={sentByEmail}
          onClose={() => setAssignments(null)}
        />
      )}
    </>
  );
}
