import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getTenantById, createMembership, getUserRoleForTenant, getLocalVendorById, updateLocalVendor } from "@/lib/airtable";
import { verifyInviteToken, isVendorInvite } from "@/lib/invites";
import { Resend } from "resend";
import { buildNewUserAdminEmail } from "@/lib/email";

interface RouteContext {
  params: Promise<{ token: string }>;
}

// GET /api/invites/[token] — validate token and return invite preview
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { token } = await params;

  let data: ReturnType<typeof verifyInviteToken>;
  try {
    data = verifyInviteToken(token);
  } catch (err) {
    return NextResponse.json(
      { valid: false, error: err instanceof Error ? err.message : "Invalid token" },
      { status: 400 }
    );
  }

  if (isVendorInvite(data)) {
    const vendor = await getLocalVendorById(data.vendorId);
    if (!vendor) {
      return NextResponse.json({ valid: false, error: "Vendor not found" }, { status: 404 });
    }
    return NextResponse.json({
      valid: true,
      vendorId: data.vendorId,
      vendorName: vendor.vendorName,
      expiresAt: data.expiresAt,
    });
  }

  const tenant = await getTenantById(data.tenantId);
  if (!tenant) {
    return NextResponse.json({ valid: false, error: "Tenant not found" }, { status: 404 });
  }

  return NextResponse.json({
    valid: true,
    tenantId: data.tenantId,
    tenantName: tenant.name,
    role: data.role,
    expiresAt: data.expiresAt,
  });
}

// POST /api/invites/[token] — accept invite (requires auth)
export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await params;

  let data: ReturnType<typeof verifyInviteToken>;
  try {
    data = verifyInviteToken(token);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid token" },
      { status: 400 }
    );
  }

  // Vendor invite: link vendor to Clerk user
  if (isVendorInvite(data)) {
    await updateLocalVendor(data.vendorId, { clerkUserId: userId });
    return NextResponse.json({ success: true, vendorId: data.vendorId, redirect: "/vendor" });
  }

  // Check if already a member
  const existingRole = await getUserRoleForTenant(userId, data.tenantId);
  if (existingRole) {
    // Already a member — just redirect them
    return NextResponse.json({ alreadyMember: true, tenantId: data.tenantId });
  }

  await createMembership({ tenantId: data.tenantId, clerkUserId: userId, role: data.role });

  // Notify admins that the invite was accepted and the user is now linked to the project.
  // This fires after the membership exists, so it always has complete project context.
  notifyAdminsInviteAccepted(userId, data.tenantId, data.role).catch(() => {});

  return NextResponse.json({ success: true, tenantId: data.tenantId });
}

// ─── Admin notification on invite acceptance ──────────────────────────────────
async function notifyAdminsInviteAccepted(clerkUserId: string, tenantId: string, role: string) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  let adminEmails: string[] = (process.env.ADMIN_NOTIFICATION_EMAIL ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);

  if (adminEmails.length === 0) {
    const adminClerkIds = (process.env.TTT_ADMIN_USER_IDS ?? "")
      .split(",").map(s => s.trim()).filter(Boolean);
    const clerkSecret = process.env.CLERK_SECRET_KEY;
    if (adminClerkIds.length > 0 && clerkSecret) {
      for (const id of adminClerkIds) {
        const r = await fetch(`https://api.clerk.com/v1/users/${id}`, {
          headers: { Authorization: `Bearer ${clerkSecret}` },
        });
        if (!r.ok) continue;
        const u = await r.json();
        const primaryId = u.primary_email_address_id as string | null;
        const email = (u.email_addresses as Array<{ id: string; email_address: string }>)
          ?.find(e => e.id === primaryId)?.email_address
          ?? (u.email_addresses as Array<{ email_address: string }>)?.[0]?.email_address;
        if (email) adminEmails.push(email);
      }
    }
  }

  if (adminEmails.length === 0) return;

  // Fetch user info and tenant info in parallel
  const clerk = await clerkClient();
  const [clerkUser, tenant] = await Promise.all([
    clerk.users.getUser(clerkUserId).catch(() => null),
    getTenantById(tenantId).catch(() => null),
  ]);

  const primaryEmailId = clerkUser?.primaryEmailAddressId;
  const email = clerkUser?.emailAddresses?.find(e => e.id === primaryEmailId)?.emailAddress
    ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? "";
  const fullName = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || email;
  const imageUrl = clerkUser?.imageUrl ?? null;

  let projectName: string | null = null;
  let projectAddress: string | null = null;
  if (tenant) {
    projectName = tenant.name;
    const addrParts = [tenant.address, tenant.city, tenant.state, tenant.zip].filter(Boolean);
    if (addrParts.length > 0) projectAddress = addrParts.join(", ");
  }

  const html = buildNewUserAdminEmail({
    fullName,
    email,
    imageUrl,
    userType: "client",
    roleLabel: `Invite Accepted — ${role}`,
    projectName,
    projectAddress,
    createdAt: new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    }),
  });

  const resend = new Resend(resendKey);
  await resend.emails.send({
    from: "Top Tier Transitions <noreply@toptiertransitions.com>",
    to: adminEmails,
    subject: `Invite Accepted: ${fullName}${projectName ? ` → ${projectName}` : ""}`,
    html,
  });
}
