import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getTenantById, createMembership, getUserRoleForTenant, getLocalVendorById, updateLocalVendor, upsertUser, getStaffMembers } from "@/lib/airtable";
import { verifyInviteToken, isVendorInvite } from "@/lib/invites";
import { Resend } from "resend";
import { buildNewUserAdminEmail } from "@/lib/email";
import { sendNewUserAdminNotification, getAdminEmails } from "@/lib/admin-notifications";

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
    const [, clerkUserForVendor, vendorRecord] = await Promise.all([
      updateLocalVendor(data.vendorId, { clerkUserId: userId }),
      clerkClient().then(c => c.users.getUser(userId)).catch(() => null),
      getLocalVendorById(data.vendorId).catch(() => null),
    ]);
    const vendorEmail = clerkUserForVendor?.emailAddresses?.find(
      e => e.id === clerkUserForVendor.primaryEmailAddressId
    )?.emailAddress ?? clerkUserForVendor?.emailAddresses?.[0]?.emailAddress ?? "";
    const vendorFullName = [clerkUserForVendor?.firstName, clerkUserForVendor?.lastName]
      .filter(Boolean).join(" ") || vendorEmail;
    sendNewUserAdminNotification({
      fullName: vendorFullName,
      email: vendorEmail,
      imageUrl: clerkUserForVendor?.imageUrl ?? null,
      userType: "unknown",
      roleLabel: "Vendor",
      projectName: vendorRecord?.vendorName ?? null,
    }).catch(() => {});
    return NextResponse.json({ success: true, vendorId: data.vendorId, redirect: "/vendor" });
  }

  // Check if already a member
  const existingRole = await getUserRoleForTenant(userId, data.tenantId);
  if (existingRole) {
    // Already a member — just redirect them
    return NextResponse.json({ alreadyMember: true, tenantId: data.tenantId });
  }

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId).catch(() => null);
  const primaryEmailId = clerkUser?.primaryEmailAddressId;
  const email = clerkUser?.emailAddresses?.find(e => e.id === primaryEmailId)?.emailAddress
    ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? "";
  const name = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || email;

  await createMembership({ tenantId: data.tenantId, clerkUserId: userId, role: data.role });

  // Track this user in the Users table so we can observe real usage before deciding to remove it.
  upsertUser({ clerkUserId: userId, email, name }).catch(() => {});

  // Notify admins that the invite was accepted and the user is now linked to the project.
  // This fires after the membership exists, so it always has complete project context.
  notifyAdminsInviteAccepted(userId, data.tenantId, data.role).catch(() => {});

  return NextResponse.json({ success: true, tenantId: data.tenantId });
}

// ─── Admin notification on invite acceptance ──────────────────────────────────
async function notifyAdminsInviteAccepted(clerkUserId: string, tenantId: string, _role: string) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim();

  // Fetch everything in parallel
  const clerk = await clerkClient();
  const [clerkUser, tenant, staffMembers, adminEmails] = await Promise.all([
    clerk.users.getUser(clerkUserId).catch(() => null),
    getTenantById(tenantId).catch(() => null),
    getStaffMembers().catch(() => []),
    getAdminEmails(),
  ]);

  const primaryEmailId = clerkUser?.primaryEmailAddressId;
  const email = clerkUser?.emailAddresses?.find(e => e.id === primaryEmailId)?.emailAddress
    ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? "";
  const fullName = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || email;
  const imageUrl = clerkUser?.imageUrl ?? null;

  let projectName: string | null = null;
  let projectAddress: string | null = null;
  let teamLeadName: string | null = null;
  if (tenant) {
    projectName = tenant.name;
    const addrParts = [tenant.address, tenant.city, tenant.state, tenant.zip].filter(Boolean);
    if (addrParts.length > 0) projectAddress = addrParts.join(", ");
    if (tenant.teamLeadClerkId) {
      const lead = staffMembers.find(s => s.clerkUserId === tenant.teamLeadClerkId);
      teamLeadName = lead?.displayName ?? null;
    }
  }

  // Recipients: all TTTAdmin + all TTTManager + the project team lead
  const recipientSet = new Set<string>(adminEmails.map(e => e.toLowerCase()));
  for (const s of staffMembers) {
    if (s.isActive && s.email && s.role === "TTTManager") {
      recipientSet.add((s.email as string).toLowerCase());
    }
    if (tenant?.teamLeadClerkId && s.clerkUserId === tenant.teamLeadClerkId && s.email) {
      recipientSet.add((s.email as string).toLowerCase());
    }
  }

  const recipients = [...recipientSet];
  if (recipients.length === 0) return;

  const planUrl = `${appUrl}/plan?tenantId=${tenantId}`;

  const html = buildNewUserAdminEmail({
    fullName,
    email,
    imageUrl,
    userType: "client",
    roleLabel: "New Client User",
    projectName,
    projectAddress,
    teamLeadName,
    planUrl,
    createdAt: new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    }),
  });

  const resend = new Resend(resendKey);
  await resend.emails.send({
    from: "Top Tier Transitions <noreply@toptiertransitions.com>",
    to: recipients,
    subject: `Internal Notification: New Client User Registered! — ${fullName}${projectName ? ` at ${projectName}` : ""}`,
    html,
  });
}
