export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Resend } from "resend";
import {
  getSystemRole,
  getEstateById,
  getStorefrontBuyersByEstate,
  getItemsForEstateSale,
} from "@/lib/airtable";
import { buildPickupDetailsEmail } from "@/lib/email";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !["TTTManager", "TTTAdmin"].includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const [estate, buyers, items] = await Promise.all([
    getEstateById(id).catch(() => null),
    getStorefrontBuyersByEstate(id).catch(() => []),
    getItemsForEstateSale(id).catch(() => []),
  ]);

  if (!estate) return NextResponse.json({ error: "Estate not found" }, { status: 404 });

  if (buyers.length === 0) {
    return NextResponse.json({ sent: 0, message: "No buyers found for this estate." });
  }

  // Build item photo map: itemId → photoUrl
  const photoMap = new Map<string, string | undefined>();
  for (const item of items) {
    photoMap.set(item.id, item.photos?.[0]?.url || undefined);
  }

  // Group all purchase records by buyer email
  const byEmail = new Map<string, (typeof buyers)[number][]>();
  for (const b of buyers) {
    const key = b.buyerEmail.toLowerCase().trim();
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key)!.push(b);
  }

  const results: { email: string; ok: boolean; error?: string }[] = [];

  for (const [, buyerRecords] of byEmail) {
    const first = buyerRecords[0];
    const buyerEmail = first.buyerEmail;
    const buyerName = first.buyerName;

    const emailItems = buyerRecords.map(b => ({
      itemName: b.itemName,
      purchaseAmount: b.purchaseAmount,
      photoUrl: photoMap.get(b.itemId),
    }));

    const html = buildPickupDetailsEmail({
      buyerName,
      buyerEmail,
      estateName: estate.name,
      cityRegion: estate.cityRegion || undefined,
      items: emailItems,
      pickupAddress: estate.pickupAddress || undefined,
      pickupWindowStart: estate.pickupWindowStart || undefined,
      pickupWindowEnd: estate.pickupWindowEnd || undefined,
      pickupWindowStartTime: estate.pickupWindowStartTime || undefined,
      pickupWindowEndTime: estate.pickupWindowEndTime || undefined,
      contactEmail: estate.contactEmail || undefined,
      contactPhone: estate.contactPhone || undefined,
      terms: estate.terms || undefined,
    });

    const subject = `Your Pickup Details — ${estate.name}`;

    try {
      await resend.emails.send({
        from: "ProFound Finds <orders@profoundfinds.com>",
        to: buyerEmail,
        subject,
        html,
      });
      results.push({ email: buyerEmail, ok: true });
      console.log(`[send-pickup-emails] Sent to ${buyerEmail} (${emailItems.length} item${emailItems.length > 1 ? "s" : ""})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ email: buyerEmail, ok: false, error: msg });
      console.error(`[send-pickup-emails] Failed for ${buyerEmail}:`, msg);
    }
  }

  const sent = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);

  return NextResponse.json({
    sent,
    total: results.length,
    failed: failed.length > 0 ? failed : undefined,
  });
}
