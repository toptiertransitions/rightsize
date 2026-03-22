import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createTenant, createMembership, upsertUser, getTenantBySlug, updateTenant, deleteTenantCascade, getUserRoleForTenant, getSystemRole, getTenants } from "@/lib/airtable";
import { slugify } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  const isTTTCaller = ["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole ?? "");
  if (!isTTTCaller) return NextResponse.json({ tenants: [] });

  const isTTTAdminCaller = sysRole === "TTTAdmin";
  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "true";
  const all = await getTenants().catch(() => []);
  const tenants = all
    .filter(t => includeArchived || !t.isArchived)
    .filter(t => isTTTAdminCaller || (t.isTTT ?? true)) // Non-TTT invisible to staff/manager
    .sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ tenants });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name: string; email?: string; displayName?: string; address?: string; city?: string; state?: string; zip?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, displayName, address, city, state, zip } = body;
  if (!name?.trim()) {
    return NextResponse.json({ error: "Project name is required" }, { status: 400 });
  }

  // Generate a unique slug
  let slug = slugify(name);
  const existing = await getTenantBySlug(slug).catch(() => null);
  if (existing) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  // Upsert user record
  await upsertUser({
    clerkUserId: userId,
    email: email || "",
    name: displayName || email || userId,
  });

  // TTT staff creating a project → mark it as TTT; self-signup clients → non-TTT
  const sysRoleForCreate = await getSystemRole(userId).catch(() => null);
  const isTTTCreator = ["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRoleForCreate ?? "");

  // Create tenant
  const tenant = await createTenant({ name: name.trim(), slug, ownerUserId: userId, address, city, state, zip, isTTT: isTTTCreator });

  // Create owner membership
  await createMembership({ tenantId: tenant.id, clerkUserId: userId, role: "Owner" });

  return NextResponse.json({ tenant });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { tenantId, name, address, city, state, zip, estimatedHours, isArchived, destinationSqFt, payoutMethod, payoutUsername, payoutCheckAddress, isTTT, isConsignmentOnly } = body;
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  const [tenantRole, sysRole] = await Promise.all([
    getUserRoleForTenant(userId, tenantId).catch(() => null),
    getSystemRole(userId),
  ]);
  const role = tenantRole ?? sysRole;
  if (!role || !["Owner", "TTTStaff", "TTTManager", "TTTAdmin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only TTTAdmin can flip isTTT
  const resolvedIsTTT = (typeof isTTT === "boolean" && sysRole === "TTTAdmin") ? isTTT : undefined;

  // TTTManager or TTTAdmin can toggle consignment-only
  const canToggleConsignment = sysRole === "TTTAdmin" || sysRole === "TTTManager";
  const resolvedConsignment = (typeof isConsignmentOnly === "boolean" && canToggleConsignment)
    ? isConsignmentOnly : undefined;

  const tenant = await updateTenant(tenantId, {
    name: typeof name === "string" && name.trim() ? name.trim() : undefined,
    address: typeof address === "string" ? address : undefined,
    city: typeof city === "string" ? city : undefined,
    state: typeof state === "string" ? state : undefined,
    zip: typeof zip === "string" ? zip : undefined,
    estimatedHours: typeof estimatedHours === "number" ? estimatedHours : undefined,
    isArchived: typeof isArchived === "boolean" ? isArchived : undefined,
    isTTT: resolvedIsTTT,
    isConsignmentOnly: resolvedConsignment,
    destinationSqFt: typeof destinationSqFt === "number" ? destinationSqFt : undefined,
    payoutMethod: payoutMethod !== undefined ? (payoutMethod as string | null) : undefined,
    payoutUsername: payoutUsername !== undefined ? (payoutUsername as string | null) : undefined,
  });
  return NextResponse.json({ tenant });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  const [tenantRole, sysRoleDel] = await Promise.all([
    getUserRoleForTenant(userId, tenantId).catch(() => null),
    getSystemRole(userId).catch(() => null),
  ]);
  const canDelete =
    tenantRole === "Owner" ||
    sysRoleDel === "TTTAdmin" ||
    sysRoleDel === "TTTManager";
  if (!canDelete) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await deleteTenantCascade(tenantId);
  return NextResponse.json({ success: true });
}
