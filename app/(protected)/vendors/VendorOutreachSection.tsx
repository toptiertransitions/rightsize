"use client";
import { useState } from "react";
import type { Item, LocalVendor } from "@/lib/types";
import type { VendorOutreach } from "@/lib/types";
import { MapToVendorsButton } from "./MapToVendorsButton";
import { OutreachQueue } from "./OutreachQueue";

interface Props {
  tenantId: string;
  projectCity: string;
  projectState: string;
  projectZip: string;
  items: Item[];
  localVendors: LocalVendor[];
  outreachRecords: Array<VendorOutreach & { agingDays: number }>;
  sentByClerkId: string;
  sentByName: string;
  sentByEmail: string;
}

export function VendorOutreachSection({
  tenantId, projectCity, projectState, projectZip,
  items, localVendors, outreachRecords,
  sentByClerkId, sentByName, sentByEmail,
}: Props) {
  const [showMapButton, setShowMapButton] = useState(false);

  // Eligible items: right route, right status, not already in outreach, not ProFoundFinds
  const eligibleItems = items.filter(i =>
    ["FB/Marketplace", "Online Marketplace", "Other Consignment", "Donate", "Discard"].includes(i.primaryRoute) &&
    ["Pending Review", "Approved", "Listed"].includes(i.status) &&
    !i.vendorOutreachStatus &&
    i.primaryRoute !== "ProFoundFinds Consignment"
  );

  const hasActiveOutreach = items.some(i => i.vendorOutreachStatus === "With Vendor");

  return (
    <div className="mt-8">
      {/* Section divider */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2">Vendor Outreach</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      {hasActiveOutreach && !showMapButton ? (
        <>
          <OutreachQueue
            tenantId={tenantId}
            outreachRecords={outreachRecords}
            items={items}
            localVendors={localVendors}
            sentByClerkId={sentByClerkId}
            sentByName={sentByName}
            sentByEmail={sentByEmail}
            projectCity={projectCity}
            projectState={projectState}
            onMapMore={() => setShowMapButton(true)}
          />
          {showMapButton && eligibleItems.length > 0 && (
            <div className="mt-4">
              <MapToVendorsButton
                tenantId={tenantId}
                projectCity={projectCity}
                projectState={projectState}
                projectZip={projectZip}
                eligibleItemCount={eligibleItems.length}
                items={items}
                vendors={localVendors}
                sentByClerkId={sentByClerkId}
                sentByName={sentByName}
                sentByEmail={sentByEmail}
              />
            </div>
          )}
        </>
      ) : (
        <MapToVendorsButton
          tenantId={tenantId}
          projectCity={projectCity}
          projectState={projectState}
          projectZip={projectZip}
          eligibleItemCount={eligibleItems.length}
          items={items}
          vendors={localVendors}
          sentByClerkId={sentByClerkId}
          sentByName={sentByName}
          sentByEmail={sentByEmail}
        />
      )}
    </div>
  );
}
