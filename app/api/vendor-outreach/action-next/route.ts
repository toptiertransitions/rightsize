export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { getSystemRole, getItemById, updateItem, createVendorOutreach, getLocalVendorById } from "@/lib/airtable";
import { buildMapToVendorsEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    tenantId, itemAirtableIds, reason, sentByClerkId, sentByName, sentByEmail, projectCity, projectState,
  }: {
    tenantId: string;
    itemAirtableIds: string[];
    reason: "skipped" | "no-response";
    sentByClerkId: string;
    sentByName: string;
    sentByEmail: string;
    projectCity: string;
    projectState: string;
  } = body;

  if (!itemAirtableIds.length) return NextResponse.json({ error: "No items" }, { status: 400 });

  // Fetch first item to get vendorQueue
  const firstItem = await getItemById(itemAirtableIds[0]).catch(() => null);
  if (!firstItem) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const queue = firstItem.vendorQueue ?? [];
  if (queue.length === 0) return NextResponse.json({ error: "No next vendor in queue" }, { status: 400 });

  const [nextVendorId, ...remainingQueue] = queue;
  const nextVendor = await getLocalVendorById(nextVendorId).catch(() => null);
  if (!nextVendor) return NextResponse.json({ error: "Next vendor not found" }, { status: 404 });

  // Fetch item records
  const itemRecords = await Promise.all(itemAirtableIds.map(id => getItemById(id).catch(() => null)));
  const validItems = itemRecords.filter((i): i is NonNullable<typeof i> => i !== null);

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
  const sentAt = new Date().toISOString();

  const html = buildMapToVendorsEmail({
    pocName: nextVendor.pocName,
    vendorName: nextVendor.vendorName,
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
    vendorPortalUrl: `${appUrl}/vendor`,
    sentByName,
  });

  let emailStatus: "Sent" | "Failed" = "Sent";
  try {
    await resend.emails.send({
      from: `Top Tier Transitions <${fromEmail}>`,
      to: nextVendor.email,
      cc: [sentByEmail],
      subject: `Items for you — ${projectCity}, ${projectState} · ${validItems.length} piece${validItems.length !== 1 ? 's' : ''} we think you'll love`,
      html,
    });
  } catch {
    emailStatus = "Failed";
  }

  await createVendorOutreach({
    tenantId,
    vendorAirtableId: nextVendor.id,
    vendorName: nextVendor.vendorName,
    pocName: nextVendor.pocName,
    pocEmail: nextVendor.email,
    itemIds: itemAirtableIds,
    itemCount: validItems.length,
    sentByClerkId,
    sentByName,
    sentByEmail,
    sentAt,
    emailStatus,
    isHeadsUpSent: false,
  });

  await Promise.all(
    itemAirtableIds.map(itemId =>
      updateItem(itemId, {
        currentVendorId: nextVendor.id,
        vendorQueue: remainingQueue,
      }).catch(() => null)
    )
  );

  return NextResponse.json({ success: true, nextVendorName: nextVendor.vendorName });
}
