import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getSoldStorefrontItemsSince, getAllShoppers, createShopper, updateShopper } from "@/lib/airtable";
import type { EstateSaleShopperSource } from "@/lib/types";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId);
  if (role !== "TTTAdmin" && role !== "TTTManager") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [items, existingShoppers] = await Promise.all([
    getSoldStorefrontItemsSince(since),
    getAllShoppers(),
  ]);

  // Group sold items by buyer email, then count unique payment intents (= checkouts/transactions)
  const byEmail = new Map<string, {
    name: string;
    email: string;
    phone?: string;
    source: EstateSaleShopperSource;
    totalSpend: number;
    transactionCount: number;
    seenIntents: Set<string>;
    firstDate: string;
    lastDate: string;
  }>();

  for (const item of items) {
    if (!item.buyerEmail) continue;
    const key = item.buyerEmail;
    const source: EstateSaleShopperSource = item.estateSaleId ? "Online Estate Sale" : "Online Catalog";
    const existing = byEmail.get(key);
    if (existing) {
      const isNewIntent = !existing.seenIntents.has(item.stripePaymentIntentId);
      if (isNewIntent) {
        existing.seenIntents.add(item.stripePaymentIntentId);
        existing.transactionCount += 1;
      }
      existing.totalSpend = Math.round((existing.totalSpend + item.salePrice) * 100) / 100;
      if (item.completedDate < existing.firstDate) existing.firstDate = item.completedDate;
      if (item.completedDate > existing.lastDate) existing.lastDate = item.completedDate;
      if (!existing.phone && item.buyerPhone) existing.phone = item.buyerPhone;
      if (source === "Online Estate Sale") existing.source = "Online Estate Sale";
    } else {
      byEmail.set(key, {
        name: item.buyerName,
        email: key,
        phone: item.buyerPhone,
        source,
        totalSpend: item.salePrice,
        transactionCount: 1,
        seenIntents: new Set([item.stripePaymentIntentId]),
        firstDate: item.completedDate,
        lastDate: item.completedDate,
      });
    }
  }

  // Build map of existing shoppers by email
  const shopperByEmail = new Map(existingShoppers.map(s => [s.email.toLowerCase(), s]));

  const created: string[] = [];
  const updated: string[] = [];
  const errors: string[] = [];

  for (const [email, agg] of byEmail) {
    try {
      const existing = shopperByEmail.get(email);
      if (existing) {
        // Replace ProFoundFinds-sourced counts (idempotent — safe to re-run)
        await updateShopper(existing.id, {
          purchaseCount: agg.transactionCount,
          totalSpend: agg.totalSpend,
          firstPurchaseDate: agg.firstDate,
          lastPurchaseDate: agg.lastDate,
          phone: existing.phone || agg.phone,
        });
        updated.push(`${agg.name} (${email}) — ${agg.transactionCount} transaction(s), $${agg.totalSpend.toFixed(2)}`);
      } else {
        await createShopper({
          name: agg.name,
          email: agg.email,
          phone: agg.phone,
          source: agg.source,
          purchaseCount: agg.transactionCount,
          totalSpend: agg.totalSpend,
          firstPurchaseDate: agg.firstDate,
          lastPurchaseDate: agg.lastDate,
        });
        created.push(`${agg.name} (${email}) — ${agg.transactionCount} transaction(s), $${agg.totalSpend.toFixed(2)}`);
      }
    } catch (e) {
      errors.push(`${email}: ${String(e)}`);
    }
  }

  return NextResponse.json({ created, updated, errors, totalItemsSold: items.length });
}
