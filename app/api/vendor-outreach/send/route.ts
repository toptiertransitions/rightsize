export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { getSystemRole, getItemById, updateItem, createVendorOutreach, getInvoiceSettings } from "@/lib/airtable";
import { uploadFile } from "@/lib/cloudinary";
import { buildVendorHeadsUpEmail, buildMapToVendorsEmail } from "@/lib/email";

function nextTueThuWindow(): Date {
  const now = new Date();
  const ct = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(now);
  const dow = now.toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "short" });
  const hour = parseInt(ct.find(p => p.type === "hour")?.value || "0");
  const dayMap: Record<string, number> = { Tue: 0, Wed: 1, Thu: 2, Fri: 5, Sat: 4, Sun: 3, Mon: 2 };
  let daysAhead = dayMap[dow] ?? 2;
  if (daysAhead === 0 && hour >= 11) daysAhead = 7;
  const send = new Date(now);
  send.setDate(send.getDate() + daysAhead);
  send.setUTCHours(14, 0, 0, 0);
  return send;
}

interface VendorPayload {
  vendorAirtableId: string;
  vendorName: string;
  pocName: string;
  pocEmail: string;
  vendorType: string;
  itemAirtableIds: string[];
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    tenantId, projectCity, projectState, sentByClerkId, sentByName, sentByEmail,
    vendors, sendNow = false,
  }: {
    tenantId: string;
    projectCity: string;
    projectState: string;
    sentByClerkId: string;
    sentByName: string;
    sentByEmail: string;
    vendors: VendorPayload[];
    sendNow?: boolean;
  } = body;

  if (!vendors || vendors.length === 0) {
    return NextResponse.json({ error: "No vendors provided" }, { status: 400 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
  const vendorPortalUrl = `${appUrl}/vendor`;
  const sentAt = new Date().toISOString();
  const mainSendAt = sendNow ? undefined : nextTueThuWindow();

  // Load invoice settings once for PDF generation
  const invoiceSettings = await getInvoiceSettings().catch(() => null);

  // Process each vendor independently
  for (const v of vendors) {
    // Fetch item records for this vendor
    const itemRecords = await Promise.all(
      v.itemAirtableIds.map(id => getItemById(id).catch(() => null))
    );
    const validItems = itemRecords.filter((i): i is NonNullable<typeof i> => i !== null);
    if (validItems.length === 0) continue;

    // Generate PDF (non-fatal)
    let pdfCloudinaryUrl = "";
    try {
      const { renderVendorOutreachPdf } = await import("@/lib/vendorOutreachPdf");
      const pdfBuffer = await renderVendorOutreachPdf({
        vendorName: v.vendorName,
        pocName: v.pocName,
        city: projectCity,
        state: projectState,
        items: validItems,
        sentDate: new Date().toISOString().slice(0, 10),
        logoUrl: invoiceSettings?.logoUrl,
      });
      const uploaded = await uploadFile(pdfBuffer, {
        tenantId,
        mimeType: "application/pdf",
        resourceType: "raw",
        folder: `rightsize/${tenantId}/vendor-outreach`,
      });
      pdfCloudinaryUrl = uploaded.secureUrl;
    } catch (e) {
      console.error(`PDF generation failed for ${v.vendorName} (non-fatal):`, e);
    }

    // Schedule heads-up email 24h before main send
    if (!sendNow) {
      try {
        await resend.emails.send({
          from: `Top Tier Transitions <${fromEmail}>`,
          to: v.pocEmail,
          subject: `Heads up — items coming your way tomorrow`,
          html: buildVendorHeadsUpEmail({
            pocName: v.pocName,
            vendorName: v.vendorName,
            city: projectCity,
            state: projectState,
            sentByName,
          }),
          scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      } catch (e) {
        console.error(`Heads-up email scheduling failed for ${v.vendorName} (non-fatal):`, e);
      }
    }

    // Send/schedule the main outreach email
    const emailHtml = buildMapToVendorsEmail({
      pocName: v.pocName,
      vendorName: v.vendorName,
      city: projectCity,
      state: projectState,
      itemCount: validItems.length,
      items: validItems.map(i => ({
        itemName: i.itemName,
        category: i.category,
        condition: i.condition,
        valueMid: i.valueMid,
        photoUrl: i.photoUrl,
      })),
      vendorPortalUrl,
      sentByName,
    });

    let emailStatus: "Sent" | "Scheduled" | "Failed" = "Sent";
    try {
      await resend.emails.send({
        from: `Top Tier Transitions <${fromEmail}>`,
        to: v.pocEmail,
        cc: [sentByEmail],
        subject: `Items for you — ${projectCity}, ${projectState} · ${validItems.length} piece${validItems.length !== 1 ? "s" : ""} we think you'll love`,
        html: emailHtml,
        ...(mainSendAt ? { scheduledAt: mainSendAt.toISOString() } : {}),
      });
      emailStatus = mainSendAt ? "Scheduled" : "Sent";
    } catch (e) {
      console.error(`Main outreach email failed for ${v.vendorName}:`, e);
      emailStatus = "Failed";
    }

    // Create outreach record
    await createVendorOutreach({
      tenantId,
      vendorAirtableId: v.vendorAirtableId,
      vendorName: v.vendorName,
      pocName: v.pocName,
      pocEmail: v.pocEmail,
      itemIds: v.itemAirtableIds,
      itemCount: validItems.length,
      sentByClerkId,
      sentByName,
      sentByEmail,
      sentAt,
      emailStatus,
      pdfCloudinaryUrl,
      isHeadsUpSent: !sendNow,
    });

    // Update items — each vendor's items point only to that vendor
    await Promise.all(
      v.itemAirtableIds.map(itemId =>
        updateItem(itemId, {
          vendorOutreachStatus: "With Vendor",
          currentVendorId: v.vendorAirtableId,
          vendorQueue: [],
          vendorOutreachSentAt: sentAt,
        }).catch(e => console.error(`updateItem ${itemId} failed:`, e))
      )
    );
  }

  const scheduledMsg = mainSendAt
    ? `Email${vendors.length > 1 ? "s" : ""} scheduled for ${mainSendAt.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} morning`
    : undefined;

  return NextResponse.json({ success: true, scheduledMessage: scheduledMsg });
}
