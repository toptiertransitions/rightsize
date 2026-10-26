// Shared server-side builder for the "Create Mover PDF" document. Used by the
// catalog bulk action (/api/items/movers-pdf) and the Plan page's
// "Email Me: Mover Quote Request" attachment, so both produce the same PDF.
import { renderMoversPDF } from "@/lib/movers-pdf";
import { groupItemsForMovers } from "@/lib/anthropic";
import type { InvoiceSettings, Item, Tenant } from "@/lib/types";

export async function buildMoversPdf({
  items,
  tenant,
  settings,
}: {
  items: Item[];
  tenant: Tenant | null;
  settings: InvoiceSettings | null;
}): Promise<Buffer> {
  const originAddress = [tenant?.address, tenant?.city, tenant?.state, tenant?.zip].filter(Boolean).join(", ") || undefined;
  const destinationAddress = [tenant?.destAddress, tenant?.destCity, tenant?.destState, tenant?.destZip].filter(Boolean).join(", ") || undefined;

  const slim = items.map((item) => {
    const photos: { url: string }[] = item.photos?.length
      ? item.photos.map((p) => ({ url: p.url }))
      : item.photoUrl
      ? [{ url: item.photoUrl }]
      : [];
    return {
      id: item.id,
      itemName: item.itemName,
      photoUrl: item.photoUrl,
      photos,
      category: item.category,
      condition: item.condition,
      sizeClass: item.sizeClass,
    };
  });

  // AI grouping for summary page, with graceful fallback
  const aiGroups = await groupItemsForMovers(slim.map((i) => i.itemName)).catch(() => null);

  return renderMoversPDF({ items: slim, settings, aiGroups: aiGroups ?? undefined, originAddress, destinationAddress });
}
