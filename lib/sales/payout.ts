// Client payout for a sold item, from the local vendor take rate. Shared by
// the Sales page and the resale update emails so both show the same number.
import type { Item, LocalVendor } from "@/lib/types";

export interface CalcPayout { amount: number; vendorName: string; rate: number; }

export function computeCalcPayout(item: Item, localVendors: LocalVendor[]): CalcPayout | null {
  if (!item.salePrice || item.salePrice <= 0) return null;

  // Estate Sale: TTT takes 33%, client gets 67% (or clientSharePercent if set).
  // Always derive from the rate — never return rate:0, which causes the preview
  // formula to recalculate payout as 100% of salePrice.
  if (item.primaryRoute === "Estate Sale") {
    const pct = item.clientSharePercent || 67;
    return { amount: item.salePrice * (pct / 100), vendorName: "Estate Sale", rate: 100 - pct };
  }

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  let match: LocalVendor | undefined;

  if (item.primaryRoute === "Other Consignment" && item.assignedVendorId) {
    // assignedVendorId is a LocalVendor ID — look up directly
    match = localVendors.find(lv => lv.id === item.assignedVendorId);
  } else {
    // First: exact route-name match (handles "Online Marketplace", "FB/Marketplace" vendors)
    const routeNorm = norm(item.primaryRoute);
    match = localVendors.find(lv => norm(lv.vendorName) === routeNorm);

    // Fallback: fuzzy name match
    if (!match) {
      const searchTerms: string[] =
        item.primaryRoute === "ProFoundFinds Consignment" ? ["profoundfind", "profound"] :
        item.primaryRoute === "FB/Marketplace"            ? ["fbmarketplace", "facebook marketplace", "fb marketplace"] :
        item.primaryRoute === "Online Marketplace"        ? ["onlinemarketplace", "online marketplace"] :
        [];
      if (searchTerms.length === 0) return null;
      const normTerms = searchTerms.map(norm);
      match = localVendors.find(lv => {
        const n = norm(lv.vendorName);
        return normTerms.some(t => n.includes(t) || t.includes(n));
      });
    }
  }

  if (!match || match.consignmentTake <= 0) {
    // Fallback: item has a stored clientSharePercent (e.g. non-TTT 50% share)
    if (item.clientSharePercent != null && item.clientSharePercent > 0) {
      return {
        amount: item.salePrice * (item.clientSharePercent / 100),
        vendorName: "",
        rate: 100 - item.clientSharePercent,
      };
    }
    return null;
  }
  // Per-item clientSharePercent overrides the vendor's default rate
  if (item.clientSharePercent != null && item.clientSharePercent > 0) {
    return {
      amount: item.salePrice * (item.clientSharePercent / 100),
      vendorName: match.vendorName,
      rate: 100 - item.clientSharePercent,
    };
  }
  return {
    amount: item.salePrice * (1 - match.consignmentTake / 100),
    vendorName: match.vendorName,
    rate: match.consignmentTake,
  };
}
