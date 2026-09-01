"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { VendorAssignment } from "@/lib/vendorMapping";
import type { Item, LocalVendor } from "@/lib/types";
import { MapToVendorsVendorCard } from "./MapToVendorsVendorCard";
import { MapToVendorsDontSendTray } from "./MapToVendorsDontSendTray";

interface RemovedItem {
  itemId: string;
  itemName: string;
  category: string;
  valueMid: number;
  photoUrl?: string;
  originalVendorId: string;
}

interface Props {
  tenantId: string;
  projectCity: string;
  projectState: string;
  projectZip: string;
  assignments: VendorAssignment[];
  items: Item[];
  vendors: LocalVendor[];
  sentByClerkId: string;
  sentByName: string;
  sentByEmail: string;
  onClose: () => void;
}

export function MapToVendorsModal({
  tenantId, projectCity, projectState, projectZip,
  assignments, items, vendors,
  sentByClerkId, sentByName, sentByEmail,
  onClose,
}: Props) {
  const router = useRouter();
  const vendorMap = new Map(vendors.map(v => [v.id, v]));
  const itemMap = new Map(items.map(i => [i.id, i]));

  // vendorItems: current item lists per vendor (source of truth for what gets sent)
  const [vendorItems, setVendorItems] = useState<Map<string, string[]>>(() => {
    const m = new Map<string, string[]>();
    for (const a of assignments) {
      m.set(a.vendorId, a.assignedItems.map(ai => ai.itemId));
    }
    return m;
  });
  const [removed, setRemoved] = useState<RemovedItem[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [scheduledMsg, setScheduledMsg] = useState("");

  // Vendors still active (have items assigned)
  const activeAssignments = assignments.filter(a => (vendorItems.get(a.vendorId) ?? []).length > 0);
  const allRemoved = activeAssignments.length === 0;

  function handleRemoveItem(itemId: string, vendorId: string) {
    setVendorItems(prev => {
      const m = new Map(prev);
      m.set(vendorId, (m.get(vendorId) ?? []).filter(id => id !== itemId));
      return m;
    });
    const item = itemMap.get(itemId);
    if (item) {
      setRemoved(prev => [...prev, {
        itemId, itemName: item.itemName, category: item.category,
        valueMid: item.valueMid, photoUrl: item.photoUrl, originalVendorId: vendorId,
      }]);
    }
  }

  function handleMoveItem(itemId: string, fromVendorId: string, toVendorId: string) {
    setVendorItems(prev => {
      const m = new Map(prev);
      m.set(fromVendorId, (m.get(fromVendorId) ?? []).filter(id => id !== itemId));
      m.set(toVendorId, [...(m.get(toVendorId) ?? []), itemId]);
      return m;
    });
  }

  function handleRemoveVendor(vendorId: string) {
    const itemIds = vendorItems.get(vendorId) ?? [];
    setVendorItems(prev => { const m = new Map(prev); m.set(vendorId, []); return m; });
    const newRemoved: RemovedItem[] = [];
    for (const itemId of itemIds) {
      const item = itemMap.get(itemId);
      if (item) {
        newRemoved.push({
          itemId, itemName: item.itemName, category: item.category,
          valueMid: item.valueMid, photoUrl: item.photoUrl, originalVendorId: vendorId,
        });
      }
    }
    setRemoved(prev => [...prev, ...newRemoved]);
  }

  function handleUndo(itemId: string) {
    const entry = removed.find(r => r.itemId === itemId);
    if (!entry) return;
    setRemoved(prev => prev.filter(r => r.itemId !== itemId));
    setVendorItems(prev => {
      const m = new Map(prev);
      m.set(entry.originalVendorId, [...(m.get(entry.originalVendorId) ?? []), itemId]);
      return m;
    });
  }

  async function handleSend() {
    // Build the list of vendors that still have items, preserving AI assignment order
    const toSend = assignments
      .map(a => {
        const vendor = vendorMap.get(a.vendorId);
        const itemAirtableIds = vendorItems.get(a.vendorId) ?? [];
        if (!vendor || itemAirtableIds.length === 0) return null;
        return {
          vendorAirtableId: vendor.id,
          vendorName: vendor.vendorName,
          pocName: vendor.pocName,
          pocEmail: vendor.email,
          vendorType: vendor.vendorType,
          itemAirtableIds,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    if (toSend.length === 0) return;

    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/vendor-outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId, projectCity, projectState, projectZip,
          sentByClerkId, sentByName, sentByEmail,
          vendors: toSend,
        }),
      });
      if (!res.ok) throw new Error("Send failed");
      const data = await res.json();
      if (data.scheduledMessage) setScheduledMsg(data.scheduledMessage);
      router.refresh();
      onClose();
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setSending(false);
    }
  }

  // Send button label
  const vendorCount = activeAssignments.length;
  const sendLabel = (() => {
    if (vendorCount === 0) return "No vendors selected";
    if (vendorCount === 1) {
      const v = vendorMap.get(activeAssignments[0].vendorId);
      return `Send to ${v?.vendorName ?? "vendor"} →`;
    }
    return `Send to ${vendorCount} vendors →`;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-[#2d4a3e]/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Map to Vendors</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Adjust assignments, move items between vendors, or remove any before sending.
            </p>
          </div>
          <button onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 text-xl font-bold">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeAssignments.length === 0 && removed.length === 0 && (
            <p className="text-center text-gray-400 py-8">No items assigned yet.</p>
          )}

          {assignments.map((assignment, idx) => {
            const vendor = vendorMap.get(assignment.vendorId);
            if (!vendor) return null;
            const currentItemIds = vendorItems.get(assignment.vendorId) ?? [];
            if (currentItemIds.length === 0) return null;

            // Build the filtered assignment to only show current items
            const filteredAssignment = {
              ...assignment,
              assignedItems: assignment.assignedItems.filter(ai => currentItemIds.includes(ai.itemId)),
            };

            // Other active vendors (for move targets) — those that currently have items
            const otherVendors = assignments
              .filter(a => a.vendorId !== assignment.vendorId && (vendorItems.get(a.vendorId) ?? []).length > 0)
              .map(a => vendorMap.get(a.vendorId))
              .filter((v): v is LocalVendor => !!v);

            return (
              <MapToVendorsVendorCard
                key={assignment.vendorId}
                vendor={vendor}
                assignment={filteredAssignment}
                rank={idx + 1}
                items={items}
                otherVendors={otherVendors}
                onRemoveItem={handleRemoveItem}
                onMoveItem={handleMoveItem}
                onRemoveVendor={handleRemoveVendor}
              />
            );
          })}

          {removed.length > 0 && (
            <MapToVendorsDontSendTray items={removed} onUndo={handleUndo} />
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 border-t border-gray-100 flex items-center justify-between gap-4">
          <button onClick={onClose}
            className="min-h-[44px] px-6 border border-gray-300 text-gray-700 font-medium rounded-xl text-sm hover:bg-gray-50">
            Cancel
          </button>
          <div className="flex flex-col items-end gap-1">
            {activeAssignments.length > 1 && (
              <p className="text-xs text-gray-400 text-right">
                Each vendor receives only their assigned items
              </p>
            )}
            <button
              onClick={handleSend}
              disabled={sending || allRemoved}
              className="min-h-[44px] px-6 bg-[#2d4a3e] text-white font-semibold rounded-xl text-sm hover:bg-[#1e3329] disabled:opacity-50 disabled:cursor-not-allowed">
              {sending ? "Sending…" : sendLabel}
            </button>
            {error && <p className="text-xs text-red-500 text-right">{error}</p>}
            {scheduledMsg && <p className="text-xs text-[#2d4a3e] text-right">{scheduledMsg}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
