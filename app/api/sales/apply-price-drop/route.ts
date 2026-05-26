import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { getSystemRole, getTenantById, getItemsForTenant, batchUpdateItemPrices, updateItem, logItemPriceChange } from "@/lib/airtable";
import { upsertSquareCatalogItem } from "@/lib/square";
import { buildAppliedPriceDropEmail, type AppliedDropEmailItem } from "@/lib/email";
import type { PrimaryRoute } from "@/lib/types";

const CONSIGNMENT_ROUTES: PrimaryRoute[] = [
  "ProFoundFinds Consignment",
  "FB/Marketplace",
  "Online Marketplace",
  "Other Consignment",
  "Estate Sale",
];

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { tenantId, type } = body as { tenantId: string; type: "drop1" | "drop2" | "revert" };
  if (!tenantId || !type) return NextResponse.json({ error: "Missing tenantId or type" }, { status: 400 });

  const locationId = process.env.SQUARE_LOCATION_ID;

  const [tenant, allItems] = await Promise.all([
    getTenantById(tenantId),
    getItemsForTenant(tenantId),
  ]);

  if (!tenant) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const listedItems = allItems.filter(i =>
    i.status === "Listed" && CONSIGNMENT_ROUTES.includes(i.primaryRoute)
  );

  if (listedItems.length === 0) {
    return NextResponse.json({ updated: 0, squareSynced: 0, squareFailed: 0, itemUpdates: [] });
  }

  const drop1Pct = tenant.priceDrop1Percent ?? 33;
  const drop2Pct = tenant.priceDrop2Percent ?? 66;

  type ItemUpdate = { id: string; valueMid: number; priceDropOriginalValue: number };
  let priceUpdates: ItemUpdate[];

  if (type === "revert") {
    priceUpdates = listedItems
      .filter(i => (i.priceDropOriginalValue ?? 0) > 0)
      .map(i => ({
        id: i.id,
        valueMid: i.priceDropOriginalValue!,
        priceDropOriginalValue: 0, // 0 = cleared / no drop stored
      }));
  } else {
    const dropPct = type === "drop1" ? drop1Pct : drop2Pct;
    priceUpdates = listedItems.map(i => {
      const originalValue = i.priceDropOriginalValue || i.valueMid;
      const newPrice = Math.max(1, Math.round(originalValue * (1 - dropPct / 100)));
      return {
        id: i.id,
        valueMid: newPrice,
        priceDropOriginalValue: originalValue,
      };
    });
  }

  if (priceUpdates.length === 0) {
    return NextResponse.json({ updated: 0, squareSynced: 0, squareFailed: 0, itemUpdates: [] });
  }

  await batchUpdateItemPrices(priceUpdates);

  // Log price changes to history
  const changerName = await (async () => {
    try {
      const cl = await clerkClient();
      const u = await cl.users.getUser(userId);
      return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.emailAddresses[0]?.emailAddress || userId;
    } catch { return userId; }
  })();
  const itemMap2 = new Map(listedItems.map(i => [i.id, i]));
  const changeType: import("@/lib/types").PriceChangeType =
    type === "revert" ? "Reverted" : type === "drop1" ? "Price Drop 1" : "Price Drop 2";
  await Promise.allSettled(priceUpdates.map(u => {
    const item = itemMap2.get(u.id);
    if (!item) return Promise.resolve();
    const oldVal = type === "revert" ? item.valueMid : u.priceDropOriginalValue;
    const newVal = u.valueMid;
    return logItemPriceChange({
      itemId: u.id,
      itemName: item.itemName,
      tenantId,
      oldValue: oldVal,
      newValue: newVal,
      changedBy: changerName,
      changeType,
    });
  }));

  // Square sync for ProFoundFinds Consignment items with barcodes
  let squareSynced = 0;
  let squareFailed = 0;

  if (locationId) {
    const pfItems = listedItems.filter(
      i => i.primaryRoute === "ProFoundFinds Consignment" && i.barcodeNumber
    );

    for (const item of pfItems) {
      const update = priceUpdates.find(u => u.id === item.id);
      if (!update) continue;
      try {
        const { catalogItemId, catalogVariationId } = await upsertSquareCatalogItem({
          existingItemId: item.squareCatalogItemId,
          existingVariationId: item.squareCatalogVariationId,
          name: item.itemName,
          priceCents: Math.round(update.valueMid * 100),
          sku: item.barcodeNumber!,
          locationId,
        });
        await updateItem(item.id, {
          squareCatalogItemId: catalogItemId,
          squareCatalogVariationId: catalogVariationId,
          squareSyncedAt: new Date().toISOString(),
        });
        squareSynced++;
      } catch (e) {
        console.error(`[apply-price-drop] Square sync failed for ${item.id}:`, e);
        squareFailed++;
      }
      await new Promise(r => setTimeout(r, 50));
    }
  }

  // Send reference email to the user who applied the drop (drop1 / drop2 only, not revert)
  if (type !== "revert" && priceUpdates.length > 0) {
    try {
      const dropPct = type === "drop1" ? drop1Pct : drop2Pct;
      const dropNumber: 1 | 2 = type === "drop1" ? 1 : 2;

      const clerk = await clerkClient();
      const clerkUser = await clerk.users.getUser(userId);
      const userEmail = clerkUser.emailAddresses[0]?.emailAddress;

      if (userEmail) {
        const itemMap = new Map(listedItems.map(i => [i.id, i]));
        const emailItems: AppliedDropEmailItem[] = priceUpdates.map(u => {
          const item = itemMap.get(u.id);
          const displayId = item?.barcodeNumber || u.id.slice(-6).toUpperCase();
          return {
            displayId,
            itemName: item?.itemName ?? u.id,
            photoUrl: item?.photoUrl,
            prevPrice: u.priceDropOriginalValue,
            newPrice: u.valueMid,
            dropPct,
          };
        });

        const appliedAt = new Date().toLocaleString("en-US", {
          timeZone: "America/New_York",
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        });

        const html = buildAppliedPriceDropEmail({
          tenantName: tenant.name,
          dropNumber,
          dropPercent: dropPct,
          appliedAt,
          items: emailItems,
        });

        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: "hello@toptiertransitions.com",
          to: userEmail,
          subject: `Price Drop ${dropNumber} Applied — ${tenant.name} (${priceUpdates.length} item${priceUpdates.length !== 1 ? "s" : ""})`,
          html,
        });
      }
    } catch (e) {
      console.error("[apply-price-drop] email send failed:", e);
    }
  }

  return NextResponse.json({
    updated: priceUpdates.length,
    squareSynced,
    squareFailed,
    itemUpdates: priceUpdates,
  });
}
