export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Resend } from "resend";
import {
  getSystemRole,
  getEstateById,
  getStorefrontBuyersByEstate,
  getItemsForEstateSale,
  getStaffMembers,
} from "@/lib/airtable";
import { buildPickupDetailsEmail } from "@/lib/email";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !["TTTManager", "TTTAdmin"].includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Optional: only send to a single buyer email (resend flow)
  let body: { targetEmail?: string } = {};
  try { body = await req.json(); } catch { /* no body is fine */ }
  const targetEmail = body.targetEmail?.toLowerCase().trim() || null;

  const [estate, buyers, items] = await Promise.all([
    getEstateById(id).catch(() => null),
    getStorefrontBuyersByEstate(id).catch(() => []),
    getItemsForEstateSale(id).catch(() => []),
  ]);

  if (!estate) return NextResponse.json({ error: "Estate not found" }, { status: 404 });

  if (buyers.length === 0) {
    return NextResponse.json({ sent: 0, total: 0, message: "No buyers found for this estate." });
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

  for (const [emailKey, buyerRecords] of byEmail) {
    // If resending to one buyer, skip all others
    if (targetEmail && emailKey !== targetEmail) continue;

    const first = buyerRecords[0];
    const buyerEmail = first.buyerEmail.trim();
    const buyerName = first.buyerName.trim();

    try {
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
        pickupNotes: estate.pickupNotes || undefined,
      });

      const subject = `Your Pickup Details — ${estate.name}`;

      const { error: sendError } = await resend.emails.send({
        from: "ProFound Finds <orders@profoundfinds.com>",
        to: buyerEmail,
        cc: ["info@profoundfinds.com"],
        subject,
        html,
      });
      if (sendError) {
        results.push({ email: buyerEmail, ok: false, error: sendError.message });
        console.error(`[send-pickup-emails] Resend error for ${buyerEmail}:`, sendError.message);
      } else {
        results.push({ email: buyerEmail, ok: true });
        console.log(`[send-pickup-emails] Sent to ${buyerEmail} (${emailItems.length} item${emailItems.length > 1 ? "s" : ""})`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ email: buyerEmail, ok: false, error: msg });
      console.error(`[send-pickup-emails] Failed for ${buyerEmail}:`, msg);
    }
  }

  const sent = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);

  // Notify TTTAdmins of any failures (fire-and-forget)
  if (failed.length > 0) {
    (async () => {
      try {
        const staff = await getStaffMembers();
        const adminEmails = staff
          .filter(s => s.isActive && s.role === "TTTAdmin" && s.email)
          .map(s => s.email);
        if (!adminEmails.length) return;

        const failureList = failed
          .map(f => `<li>${f.email}${f.error ? ` — ${f.error}` : ""}</li>`)
          .join("");

        await resend.emails.send({
          from: "Rightsize Alerts <notifications@toptiertransitions.com>",
          to: adminEmails,
          subject: `Pickup Email Failures — ${estate.name}`,
          html: `<p>${failed.length} pickup email${failed.length > 1 ? "s" : ""} failed to send for <strong>${estate.name}</strong>:</p><ul>${failureList}</ul><p>${sent} of ${results.length} sent successfully.</p>`,
        });
      } catch (e) {
        console.error("[send-pickup-emails] admin failure notification error:", e);
      }
    })();
  }

  return NextResponse.json({
    sent,
    total: results.length,
    failed: failed.length > 0 ? failed : undefined,
  });
}
