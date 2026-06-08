"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Item, VendorOutreach, LocalVendor } from "@/lib/types";
import { OutreachActiveCard } from "./OutreachActiveCard";
import { OutreachQueuedCard } from "./OutreachQueuedCard";
import { OutreachCompleteState } from "./OutreachCompleteState";

interface Props {
  tenantId: string;
  outreachRecords: Array<VendorOutreach & { agingDays: number }>;
  items: Item[];
  localVendors: LocalVendor[];
  sentByClerkId: string;
  sentByName: string;
  sentByEmail: string;
  projectCity: string;
  projectState: string;
  onMapMore: () => void;
}

export function OutreachQueue({
  tenantId, outreachRecords, items, localVendors,
  sentByClerkId, sentByName, sentByEmail,
  projectCity, projectState, onMapMore,
}: Props) {
  const router = useRouter();

  // Active items: with vendor, not yet claimed
  const activeItems = items.filter(i =>
    i.vendorOutreachStatus === "With Vendor" && i.currentVendorId
  );

  // Group by currentVendorId
  const vendorGroups = new Map<string, Item[]>();
  for (const item of activeItems) {
    if (!item.currentVendorId) continue;
    if (!vendorGroups.has(item.currentVendorId)) vendorGroups.set(item.currentVendorId, []);
    vendorGroups.get(item.currentVendorId)!.push(item);
  }

  const claimedItems = items.filter(i => i.vendorOutreachStatus === "Claimed");
  const allResolved = activeItems.length === 0 && (claimedItems.length > 0 || outreachRecords.length > 0);

  if (allResolved) {
    return <OutreachCompleteState onMapMore={onMapMore} />;
  }

  const vendorMap = new Map(localVendors.map(v => [v.id, v]));
  const vendorGroupsList = Array.from(vendorGroups.entries());

  return (
    <div className="space-y-2">
      {vendorGroupsList.map(([vendorId, groupItems], idx) => {
        const vendor = vendorMap.get(vendorId);
        if (!vendor) return null;

        const record = outreachRecords.find(r => r.vendorAirtableId === vendorId);
        const agingDays = record?.agingDays ?? 0;
        const queue = groupItems[0]?.vendorQueue ?? [];
        const nextVendor = queue[0] ? vendorMap.get(queue[0]) : undefined;

        if (idx === 0) {
          // Active card
          return (
            <OutreachActiveCard
              key={vendorId}
              vendorName={vendor.vendorName}
              vendorType={vendor.vendorType}
              city={vendor.city}
              state={vendor.state}
              pocName={vendor.pocName}
              itemThumbs={groupItems.map(i => ({ url: i.photoUrl, name: i.itemName }))}
              itemCount={groupItems.length}
              agingDays={agingDays}
              nextVendorName={nextVendor?.vendorName}
              onSkip={async () => {
                const res = await fetch("/api/vendor-outreach/action-next", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    tenantId,
                    itemAirtableIds: groupItems.map(i => i.id),
                    reason: "skipped",
                    sentByClerkId,
                    sentByName,
                    sentByEmail,
                    projectCity,
                    projectState,
                  }),
                });
                if (!res.ok) throw new Error("Skip failed");
                router.refresh();
              }}
              onClaim={async () => {
                const res = await fetch("/api/vendor-outreach/mark-claimed", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    tenantId,
                    itemAirtableIds: groupItems.map(i => i.id),
                    vendorAirtableId: vendorId,
                  }),
                });
                if (!res.ok) throw new Error("Claim failed");
                router.refresh();
              }}
            />
          );
        }

        // Queued card
        const rank = idx + 1;
        const prevVendorId = vendorGroupsList[idx - 1][0];
        const prevVendor = vendorMap.get(prevVendorId);
        return (
          <OutreachQueuedCard
            key={vendorId}
            vendorName={vendor.vendorName}
            vendorType={vendor.vendorType}
            city={vendor.city}
            state={vendor.state}
            itemCount={groupItems.length}
            rank={rank}
            waitingFor={prevVendor?.vendorName ?? "the previous vendor"}
          />
        );
      })}
    </div>
  );
}
