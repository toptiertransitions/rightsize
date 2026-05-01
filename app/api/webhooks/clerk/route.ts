import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { Resend } from "resend";
import { AIRTABLE_TABLES } from "@/lib/config";
import { buildNewUserAdminEmail } from "@/lib/email";

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

async function getStaffRoleRecord(clerkUserId: string): Promise<{ role: string; displayName: string } | null> {
  const formula = encodeURIComponent(`{ClerkUserId} = "${clerkUserId}"`);
  const res = await fetch(
    `${BASE_URL}/${encodeURIComponent(AIRTABLE_TABLES.STAFF_ROLES)}?filterByFormula=${formula}&maxRecords=1`,
    { headers: AT_HEADERS }
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.records?.length) return null;
  const f = data.records[0].fields;
  return { role: (f["Role"] as string) || "", displayName: (f["DisplayName"] as string) || "" };
}

async function getMembershipsForUser(clerkUserId: string): Promise<Array<{ tenantId: string; role: string }>> {
  const formula = encodeURIComponent(`{UserId} = "${clerkUserId}"`);
  const res = await fetch(
    `${BASE_URL}/${encodeURIComponent(AIRTABLE_TABLES.MEMBERSHIPS)}?filterByFormula=${formula}&maxRecords=5`,
    { headers: AT_HEADERS }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.records ?? []).map((r: { fields: Record<string, unknown> }) => ({
    tenantId: (r.fields["TenantId"] as string) || "",
    role: (r.fields["Role"] as string) || "",
  })).filter((m: { tenantId: string }) => m.tenantId);
}

async function getTenantById(tenantId: string): Promise<{ name: string; address?: string; city?: string; state?: string; zip?: string } | null> {
  const formula = encodeURIComponent(`{TenantId} = "${tenantId}"`);
  const res = await fetch(
    `${BASE_URL}/${encodeURIComponent(AIRTABLE_TABLES.TENANTS)}?filterByFormula=${formula}&maxRecords=1`,
    { headers: AT_HEADERS }
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.records?.length) return null;
  const f = data.records[0].fields;
  return {
    name: (f["Name"] as string) || "",
    address: (f["Address"] as string) || undefined,
    city: (f["City"] as string) || undefined,
    state: (f["State"] as string) || undefined,
    zip: (f["Zip"] as string) || undefined,
  };
}

async function sendAdminNotification(params: {
  fullName: string;
  email: string;
  imageUrl?: string | null;
  userType: "client" | "staff" | "unknown";
  roleLabel: string;
  projectName?: string | null;
  projectAddress?: string | null;
  createdAt: string;
}) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  // Get all TTTAdmin Clerk IDs from env var, fetch their emails via Clerk API
  const adminClerkIds = (process.env.TTT_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminClerkIds.length === 0) return;

  const clerkSecret = process.env.CLERK_SECRET_KEY;
  if (!clerkSecret) return;

  const adminEmails: string[] = [];
  for (const id of adminClerkIds) {
    const r = await fetch(`https://api.clerk.com/v1/users/${id}`, {
      headers: { Authorization: `Bearer ${clerkSecret}` },
    });
    if (!r.ok) continue;
    const u = await r.json();
    const primaryId = u.primary_email_address_id as string | null;
    const email = (u.email_addresses as Array<{ id: string; email_address: string }>)
      ?.find((e) => e.id === primaryId)?.email_address
      ?? (u.email_addresses as Array<{ email_address: string }>)?.[0]?.email_address;
    if (email) adminEmails.push(email);
  }

  if (adminEmails.length === 0) return;

  const resend = new Resend(resendKey);
  const html = buildNewUserAdminEmail(params);
  await resend.emails.send({
    from: "Top Tier Transitions <noreply@toptiertransitions.com>",
    to: adminEmails,
    subject: `New User: ${params.fullName} (${params.roleLabel})`,
    html,
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
    const imageUrl = (d.image_url as string | null) ?? null;

    await updateStaffDisplayName(clerkUserId, firstName, lastName, primaryEmail);

    // Send admin notification only for new accounts
    if (event.type === "user.created" && primaryEmail) {
      const fullName = [firstName, lastName].filter(Boolean).join(" ") || primaryEmail;
      const createdAtMs = (d.created_at as number | null) ?? Date.now();
      const createdAt = new Date(createdAtMs).toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      });

      // Determine role: check StaffRoles table first
      const staffRecord = await getStaffRoleRecord(clerkUserId);
      let userType: "client" | "staff" | "unknown" = "unknown";
      let roleLabel = "Self-registered";

      if (staffRecord?.role) {
        userType = "staff";
        roleLabel = staffRecord.role; // e.g. "TTTStaff", "TTTManager", "TTTSales"
      }

      // Check memberships for project association
      let projectName: string | null = null;
      let projectAddress: string | null = null;
      const memberships = await getMembershipsForUser(clerkUserId);
      if (memberships.length > 0) {
        if (userType === "unknown") {
          userType = "client";
          roleLabel = memberships[0].role || "Client";
        }
        const tenant = await getTenantById(memberships[0].tenantId);
        if (tenant) {
          projectName = tenant.name;
          const addrParts = [tenant.address, tenant.city, tenant.state, tenant.zip].filter(Boolean);
          if (addrParts.length > 0) projectAddress = addrParts.join(", ");
        }
      }

      await sendAdminNotification({
        fullName,
        email: primaryEmail,
        imageUrl,
        userType,
        roleLabel,
        projectName,
        projectAddress,
        createdAt,
      }).catch(() => {}); // never block the webhook response
    }
  }

  return NextResponse.json({ ok: true });
}
