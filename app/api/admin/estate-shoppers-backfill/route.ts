import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getAllStorefrontBuyersSince, getAllShoppers, createShopper, updateShopper } from "@/lib/airtable";
import type { EstateSaleShopperSource } from "@/lib/types";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId);
  if (role !== "TTTAdmin" && role !== "TTTManager") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [buyers, existingShoppers] = await Promise.all([
    getAllStorefrontBuyersSince(since),
    getAllShoppers(),
  ]);

  // Group StorefrontBuyer rows by lowercased email
  const byEmail = new Map<string, {
    name: string;
    email: string;
    phone?: string;
    source: EstateSaleShopperSource;
    totalSpend: number;
    count: number;
    firstDate: string;
    lastDate: string;
  }>();

  for (const b of buyers) {
    if (!b.buyerEmail) continue;
    const key = b.buyerEmail.toLowerCase().trim();
    const source: EstateSaleShopperSource = b.estateSaleId ? "Online Estate Sale" : "Online Catalog";
    const existing = byEmail.get(key);
    if (existing) {
      existing.totalSpend = Math.round((existing.totalSpend + b.purchaseAmount) * 100) / 100;
      existing.count += 1;
      if (b.createdAt < existing.firstDate) existing.firstDate = b.createdAt;
      if (b.createdAt > existing.lastDate) existing.lastDate = b.createdAt;
      if (!existing.phone && b.buyerPhone) existing.phone = b.buyerPhone;
      // Prefer "Online Estate Sale" over "Online Catalog" if either purchase was an estate sale
      if (source === "Online Estate Sale") existing.source = "Online Estate Sale";
    } else {
      byEmail.set(key, {
        name: b.buyerName,
        email: key,
        phone: b.buyerPhone,
        source,
        totalSpend: b.purchaseAmount,
        count: 1,
        firstDate: b.createdAt,
        lastDate: b.createdAt,
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
        // Update only if the backfill data adds new purchase history
        const newCount = existing.purchaseCount + agg.count;
        const newSpend = Math.round((existing.totalSpend + agg.totalSpend) * 100) / 100;
        const firstDate = existing.firstPurchaseDate && existing.firstPurchaseDate < agg.firstDate
          ? existing.firstPurchaseDate : agg.firstDate;
        const lastDate = existing.lastPurchaseDate && existing.lastPurchaseDate > agg.lastDate
          ? existing.lastPurchaseDate : agg.lastDate;
        await updateShopper(existing.id, {
          purchaseCount: newCount,
          totalSpend: newSpend,
          firstPurchaseDate: firstDate,
          lastPurchaseDate: lastDate,
          phone: existing.phone || agg.phone,
        });
        updated.push(`${agg.name} (${email}) — +${agg.count} purchase(s)`);
      } else {
        await createShopper({
          name: agg.name,
          email: agg.email,
          phone: agg.phone,
          source: agg.source,
          purchaseCount: agg.count,
          totalSpend: agg.totalSpend,
          firstPurchaseDate: agg.firstDate,
          lastPurchaseDate: agg.lastDate,
        });
        created.push(`${agg.name} (${email}) — ${agg.count} purchase(s), $${agg.totalSpend.toFixed(2)}`);
      }
    } catch (e) {
      errors.push(`${email}: ${String(e)}`);
    }
  }

  return NextResponse.json({ created, updated, errors, totalBuyerRows: buyers.length });
}
