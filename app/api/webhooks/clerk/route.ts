import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { AIRTABLE_TABLES } from "@/lib/config";

const BASE_URL = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}`;
const AT_HEADERS = {
  Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}`,
  "Content-Type": "application/json",
};

async function updateStaffDisplayName(clerkUserId: string, firstName: string | null, lastName: string | null, email: string | null) {
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || email || "";
  if (!displayName) return;

  const formula = encodeURIComponent(`{ClerkUserId} = "${clerkUserId}"`);
  const res = await fetch(
    `${BASE_URL}/${encodeURIComponent(AIRTABLE_TABLES.STAFF_ROLES)}?filterByFormula=${formula}&maxRecords=1`,
    { headers: AT_HEADERS }
  );
  if (!res.ok) return;
  const data = await res.json();
  if (!data.records?.length) return;

  const recordId = data.records[0].id;
  const fields: Record<string, string> = { DisplayName: displayName };
  if (email) fields["Email"] = email;

  await fetch(`${BASE_URL}/${encodeURIComponent(AIRTABLE_TABLES.STAFF_ROLES)}/${recordId}`, {
    method: "PATCH",
    headers: AT_HEADERS,
    body: JSON.stringify({ fields }),
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let event: { type: string; data: Record<string, unknown> };
  try {
    const wh = new Webhook(secret);
    event = wh.verify(payload, headers) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "user.updated" || event.type === "user.created") {
    const d = event.data;
    const clerkUserId = d.id as string;
    const firstName = (d.first_name as string | null) ?? null;
    const lastName = (d.last_name as string | null) ?? null;
    const emails = d.email_addresses as { email_address: string; id: string }[] | undefined;
    const primaryEmailId = d.primary_email_address_id as string | null;
    const primaryEmail = emails?.find(e => e.id === primaryEmailId)?.email_address ?? emails?.[0]?.email_address ?? null;

    await updateStaffDisplayName(clerkUserId, firstName, lastName, primaryEmail);
  }

  return NextResponse.json({ ok: true });
}
