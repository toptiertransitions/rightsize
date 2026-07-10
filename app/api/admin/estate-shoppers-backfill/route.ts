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

  // Group StorefrontBuyer rows by lowercased email.
  // Count unique purchase DATES per email as transactions — items from the same
  // cart checkout all land on the same createdAt date, so date-deduplication
  // correctly counts checkouts rather than individual items.
  const byEmail = new Map<string, {
    name: string;
    email: string;
    phone?: string;
    source: EstateSaleShopperSource;
    totalSpend: number;
    uniqueDates: Set<string>;
    firstDate: string;
    lastDate: string;
  }>();

  for (const b of buyers) {
    if (!b.buyerEmail) continue;
    const key = b.buyerEmail.toLowerCase().trim();
    const purchaseDate = b.createdAt ? b.createdAt.split("T")[0] : "";
    const source: EstateSaleShopperSource = b.estateSaleId ? "Online Estate Sale" : "Online Catalog";
    const existing = byEmail.get(key);
    if (existing) {
      if (purchaseDate) existing.uniqueDates.add(purchaseDate);
      existing.totalSpend = Math.round((existing.totalSpend + b.purchaseAmount) * 100) / 100;
      if (b.createdAt && b.createdAt < existing.firstDate) existing.firstDate = b.createdAt;
      if (b.createdAt && b.createdAt > existing.lastDate) existing.lastDate = b.createdAt;
      if (!existing.phone && b.buyerPhone) existing.phone = b.buyerPhone;
      if (source === "Online Estate Sale") existing.source = "Online Estate Sale";
    } else {
      byEmail.set(key, {
        name: b.buyerName,
        email: key,
        phone: b.buyerPhone,
        source,
        totalSpend: b.purchaseAmount,
        uniqueDates: new Set(purchaseDate ? [purchaseDate] : []),
        firstDate: b.createdAt,
        lastDate: b.createdAt,
      });
    }
  }

  const shopperByEmail = new Map(existingShoppers.map(s => [s.email.toLowerCase(), s]));

  const created: string[] = [];
  const updated: string[] = [];
  const errors: string[] = [];

  for (const [email, agg] of byEmail) {
    const transactionCount = agg.uniqueDates.size || 1;
    try {
      const existing = shopperByEmail.get(email);
      if (existing) {
        await updateShopper(existing.id, {
          purchaseCount: transactionCount,
          totalSpend: agg.totalSpend,
          firstPurchaseDate: agg.firstDate,
          lastPurchaseDate: agg.lastDate,
          phone: existing.phone || agg.phone,
        });
        updated.push(`${agg.name} (${email}) — ${transactionCount} transaction(s), $${agg.totalSpend.toFixed(2)}`);
      } else {
        await createShopper({
          name: agg.name,
          email: agg.email,
          phone: agg.phone,
          source: agg.source,
          purchaseCount: transactionCount,
          totalSpend: agg.totalSpend,
          firstPurchaseDate: agg.firstDate,
          lastPurchaseDate: agg.lastDate,
        });
        created.push(`${agg.name} (${email}) — ${transactionCount} transaction(s), $${agg.totalSpend.toFixed(2)}`);
      }
    } catch (e) {
      errors.push(`${email}: ${String(e)}`);
    }
  }

  return NextResponse.json({ created, updated, errors, totalBuyerRows: buyers.length });
}
