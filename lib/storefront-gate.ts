// Which items the ProFound Finds storefront may show, reserve, or record a
// sale for. Consignment and Estate Sale items work exactly as before;
// FB/Marketplace items are allowed only through their own Home Pickup sale.
import { getEstateById } from "./airtable";
import { isHomePickupItem, isHomePickupLive } from "./home-pickup";
import type { Estate, Item } from "./types";

export type StorefrontGate =
  | { ok: true; estate: Estate | null; homePickup: boolean }
  | { ok: false };

/**
 * requireLive: true for showing/reserving (the sale must be live right
 * now); false for recording a completed payment, which must never be
 * refused just because the pickup window closed mid-checkout.
 */
export async function checkStorefrontItem(item: Item, { requireLive }: { requireLive: boolean }): Promise<StorefrontGate> {
  if (item.primaryRoute === "ProFoundFinds Consignment") return { ok: true, estate: null, homePickup: false };

  if (item.primaryRoute === "Estate Sale") {
    const estate = item.estateSaleId ? await getEstateById(item.estateSaleId).catch(() => null) : null;
    return { ok: true, estate, homePickup: false };
  }

  if (item.primaryRoute === "FB/Marketplace" && item.estateSaleId) {
    const estate = await getEstateById(item.estateSaleId).catch(() => null);
    if (isHomePickupItem(item, estate) && (!requireLive || isHomePickupLive(estate!))) {
      return { ok: true, estate, homePickup: true };
    }
  }
  return { ok: false };
}
