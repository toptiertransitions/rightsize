import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import {
  batchUpdateItemPrices,
  getListedProFoundFindsItems,
  getTenants,
  logItemPriceChange,
  updateItem,
} from "@/lib/airtable";
import { upsertSquareCatalogItem } from "@/lib/square";
import { getAdminEmails } from "@/lib/admin-notifications";
import { buildAutoPriceDropDigestEmail, type AutoPriceDropEmailItem } from "@/lib/email";
import { chicagoToday, dropSettings, listedPrice, scheduledPriceOn } from "@/lib/pricing/autoDrop";
import type { Item } from "@/lib/types";

// ProFoundFinds automated pricing (see lib/pricing/autoDrop.ts). Runs daily
// at 7 AM Central — vercel.json schedules it at 12:00 and 13:00 UTC so one
// lands on 7 AM in both CST and CDT, and the Chicago-time guard lets exactly
// one through. Lowers every Listed ProFoundFinds item whose drop is due,
// pushes the new price to Square, logs it in price history and emails the
// TTT Admins one digest. Safe to re-run: an item already at its scheduled
// price is left alone.
//   ?force=1   skip the 7 AM guard (still requires CRON_SECRET)
//   ?dryRun=1  report what would change; writes and emails nothing
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get("force") === "1";
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const chicagoMins =
    parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10) * 60 +
    parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  // 6:50–7:10 AM: wide enough for cron drift, narrow enough that only one of the two UTC crons runs
  if (!force && !dryRun && (chicagoMins < 410 || chicagoMins > 430)) {
    return NextResponse.json({ skipped: true, reason: "Not ~7 AM Central" });
  }

  const today = chicagoToday();
  const [items, tenants] = await Promise.all([getListedProFoundFindsItems(), getTenants().catch(() => [])]);
  const tenantById = new Map(tenants.map((t) => [t.id, t]));

  type Change = { item: Item; newPrice: number; base: number; step: 1 | 2; pct: number };
  const changes: Change[] = [];
  // Listed items missing their stored listed price (or raised above it): stamp it
  const baseStamps: { id: string; valueMid: number; priceDropOriginalValue: number }[] = [];

  for (const item of items) {
    if (item.noPriceDrop) continue; // "Price Drop?" turned off for this item
    const settings = dropSettings(tenantById.get(item.tenantId));
    const due = scheduledPriceOn(item, settings, today);
    if (!due) continue;
    if (due.step > 0 && due.price < item.valueMid) {
      changes.push({ item, newPrice: due.price, base: due.base, step: due.step as 1 | 2, pct: due.step === 2 ? settings.drop2Pct : settings.drop1Pct });
    } else if ((item.priceDropOriginalValue ?? 0) !== listedPrice(item)) {
      baseStamps.push({ id: item.id, valueMid: item.valueMid, priceDropOriginalValue: listedPrice(item) });
    }
  }

  const summary = {
    today,
    listed: items.length,
    withoutDeliveryDate: items.filter((i) => !i.deliveryDate).length,
    dropped: changes.length,
    stamped: baseStamps.length,
  };
  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      ...summary,
      changes: changes.map((c) => ({ id: c.item.id, name: c.item.itemName, from: c.item.valueMid, to: c.newPrice, listed: c.base, step: c.step })),
    });
  }

  await batchUpdateItemPrices([
    ...changes.map((c) => ({ id: c.item.id, valueMid: c.newPrice, priceDropOriginalValue: c.base })),
    ...baseStamps,
  ]);

  await Promise.allSettled(changes.map((c) => logItemPriceChange({
    itemId: c.item.id,
    itemName: c.item.itemName,
    tenantId: c.item.tenantId,
    oldValue: c.item.valueMid,
    newValue: c.newPrice,
    changedBy: "Automated pricing",
    changeType: c.step === 2 ? "Price Drop 2" : "Price Drop 1",
  })));

  // Square: the in-store price has to match
  let squareSynced = 0;
  const squareFailed: string[] = [];
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (locationId) {
    for (const c of changes) {
      if (!c.item.barcodeNumber) continue;
      try {
        const { catalogItemId, catalogVariationId } = await upsertSquareCatalogItem({
          existingItemId: c.item.squareCatalogItemId,
          existingVariationId: c.item.squareCatalogVariationId,
          name: c.item.itemName,
          priceCents: Math.round(c.newPrice * 100),
          sku: c.item.barcodeNumber,
          locationId,
        });
        await updateItem(c.item.id, { squareCatalogItemId: catalogItemId, squareCatalogVariationId: catalogVariationId, squareSyncedAt: new Date().toISOString() });
        squareSynced++;
      } catch (e) {
        console.error(`[auto-price-drops] Square sync failed for ${c.item.id}:`, e);
        squareFailed.push(c.item.itemName);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  let emailed = 0;
  if (changes.length > 0) {
    try {
      const admins = await getAdminEmails();
      if (admins.length) {
        const emailItems: AutoPriceDropEmailItem[] = changes
          .sort((a, b) => a.step - b.step || a.item.itemName.localeCompare(b.item.itemName))
          .map((c) => ({
            displayId: c.item.barcodeNumber || c.item.id.slice(-6).toUpperCase(),
            itemName: c.item.itemName,
            photoUrl: c.item.photos?.[0]?.url ?? c.item.photoUrl,
            prevPrice: c.item.valueMid,
            newPrice: c.newPrice,
            dropPct: c.pct,
            projectName: tenantById.get(c.item.tenantId)?.name ?? "",
            step: c.step,
          }));
        const dateLabel = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
        const resend = new Resend(process.env.RESEND_API_KEY);
        const { error } = await resend.emails.send({
          from: `ProFound Finds <${process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com"}>`,
          to: admins,
          subject: `Price drops today: ${changes.length} ProFoundFinds item${changes.length === 1 ? "" : "s"} repriced${squareFailed.length ? ` (${squareFailed.length} need a Square check)` : ""}`,
          html: buildAutoPriceDropDigestEmail({
            dateLabel,
            items: emailItems,
            appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim(),
          }),
        });
        if (error) throw new Error(error.message);
        emailed = admins.length;
      }
    } catch (e) {
      console.error("[auto-price-drops] admin email failed:", e);
    }
  }

  return NextResponse.json({ ...summary, squareSynced, squareFailed, emailed });
}
