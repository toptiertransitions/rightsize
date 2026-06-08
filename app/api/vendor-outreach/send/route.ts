import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { getSystemRole, getItemById, updateItem, createVendorOutreach, getInvoiceSettings } from "@/lib/airtable";
import { uploadFile } from "@/lib/cloudinary";
import { buildVendorHeadsUpEmail, buildMapToVendorsEmail } from "@/lib/email";

// Returns the next Tue/Wed/Thu 9am CT as ISO string, or null if override
function nextTueThuWindow(): Date {
  const now = new Date();
  const ct = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(now);
  const dow = now.toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "short" });
  const hour = parseInt(ct.find(p => p.type === "hour")?.value || "0");

  // Days until next Tue (2), Wed (3), Thu (4)
  const dayMap: Record<string, number> = { Tue: 0, Wed: 1, Thu: 2, Fri: 5, Sat: 4, Sun: 3, Mon: 2 };
  let daysAhead = dayMap[dow] ?? 2;
  if (daysAhead === 0 && hour >= 11) daysAhead = 7; // past window today, same-dow next week

  const send = new Date(now);
  send.setDate(send.getDate() + daysAhead);
  // Set to 9am CT = 14:00 UTC (approx, ignoring DST — close enough for scheduling)
  send.setUTCHours(14, 0, 0, 0);
  return send;
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
    topVendor, queuedVendorIds = [], sendNow = false,
  }: {
    tenantId: string;
    projectCity: string;
    projectState: string;
    sentByClerkId: string;
    sentByName: string;
    sentByEmail: string;
    topVendor: {
      vendorAirtableId: string;
      vendorName: string;
      pocName: string;
      pocEmail: string;
      vendorType: string;
      itemAirtableIds: string[];
    };
    queuedVendorIds: string[];
    sendNow?: boolean;
  } = body;

  // Fetch full item records
  const itemRecords = await Promise.all(
    topVendor.itemAirtableIds.map(id => getItemById(id).catch(() => null))
  );
  const validItems = itemRecords.filter((i): i is NonNullable<typeof i> => i !== null);

  // Attempt PDF generation — non-fatal if it fails
  let pdfCloudinaryUrl = "";
  try {
    const invoiceSettings = await getInvoiceSettings().catch(() => null);
    // Generate a simple PDF using @react-pdf/renderer
    const { renderVendorOutreachPdf } = await import("@/lib/vendorOutreachPdf");
    const pdfBuffer = await renderVendorOutreachPdf({
      vendorName: topVendor.vendorName,
      pocName: topVendor.pocName,
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
    console.error("PDF generation failed (non-fatal):", e);
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
  const vendorPortalUrl = `${appUrl}/vendor`;
  const sentAt = new Date().toISOString();

  // Schedule heads-up email 24hr before main send (skip if sendNow)
  if (!sendNow) {
    try {
      const headsUpSendAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await resend.emails.send({
        from: `Top Tier Transitions <${fromEmail}>`,
        to: topVendor.pocEmail,
        subject: `Heads up — items coming your way tomorrow`,
        html: buildVendorHeadsUpEmail({
          pocName: topVendor.pocName,
          vendorName: topVendor.vendorName,
          city: projectCity,
          state: projectState,
          sentByName,
        }),
        scheduledAt: headsUpSendAt.toISOString(),
      });
    } catch (e) {
      console.error("Heads-up email scheduling failed (non-fatal):", e);
    }
  }

  // Schedule (or immediately send) the main outreach email
  const mainSendAt = sendNow ? undefined : nextTueThuWindow();
  const emailHtml = buildMapToVendorsEmail({
    pocName: topVendor.pocName,
    vendorName: topVendor.vendorName,
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

  const emailPayload: Parameters<typeof resend.emails.send>[0] = {
    from: `Top Tier Transitions <${fromEmail}>`,
    to: topVendor.pocEmail,
    cc: [sentByEmail],
    subject: `Items for you — ${projectCity}, ${projectState} · ${validItems.length} piece${validItems.length !== 1 ? 's' : ''} we think you'll love`,
    html: emailHtml,
    ...(mainSendAt ? { scheduledAt: mainSendAt.toISOString() } : {}),
  };

  let emailStatus: "Sent" | "Scheduled" | "Failed" = "Sent";
  try {
    await resend.emails.send(emailPayload);
    emailStatus = mainSendAt ? "Scheduled" : "Sent";
  } catch (e) {
    console.error("Main outreach email failed:", e);
    emailStatus = "Failed";
  }

  // Write VendorOutreach record
  await createVendorOutreach({
    tenantId,
    vendorAirtableId: topVendor.vendorAirtableId,
    vendorName: topVendor.vendorName,
    pocName: topVendor.pocName,
    pocEmail: topVendor.pocEmail,
    itemIds: topVendor.itemAirtableIds,
    itemCount: validItems.length,
    sentByClerkId,
    sentByName,
    sentByEmail,
    sentAt,
    emailStatus,
    pdfCloudinaryUrl,
    isHeadsUpSent: !sendNow,
  });

  // Update item fields — DO NOT change status, primaryRoute, or any other field
  await Promise.all(
    topVendor.itemAirtableIds.map(itemId =>
      updateItem(itemId, {
        vendorOutreachStatus: "With Vendor",
        currentVendorId: topVendor.vendorAirtableId,
        vendorQueue: queuedVendorIds,
        vendorOutreachSentAt: sentAt,
      }).catch(e => console.error(`updateItem ${itemId} failed:`, e))
    )
  );

  const scheduledMsg = mainSendAt
    ? `Email scheduled for ${mainSendAt.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} morning`
    : undefined;

  return NextResponse.json({ success: true, scheduledMessage: scheduledMsg });
}
