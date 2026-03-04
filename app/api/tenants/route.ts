import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createTenant, createMembership, upsertUser, getTenantBySlug, updateTenant, deleteTenantCascade, getUserRoleForTenant, getSystemRole } from "@/lib/airtable";
import { slugify } from "@/lib/utils";

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

  // Create tenant
  const tenant = await createTenant({ name: name.trim(), slug, ownerUserId: userId, address, city, state, zip });

  // Create owner membership
  await createMembership({ tenantId: tenant.id, clerkUserId: userId, role: "Owner" });

  return NextResponse.json({ tenant });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tenantId, name, address, city, state, zip, estimatedHours, isArchived, destinationSqFt } = await req.json();
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  const [tenantRole, sysRole] = await Promise.all([
    getUserRoleForTenant(userId, tenantId).catch(() => null),
    getSystemRole(userId),
  ]);
  const role = tenantRole ?? sysRole;
  if (!role || !["Owner", "TTTStaff", "TTTManager", "TTTAdmin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenant = await updateTenant(tenantId, {
    name: typeof name === "string" && name.trim() ? name.trim() : undefined,
    address: typeof address === "string" ? address : undefined,
    city: typeof city === "string" ? city : undefined,
    state: typeof state === "string" ? state : undefined,
    zip: typeof zip === "string" ? zip : undefined,
    estimatedHours: typeof estimatedHours === "number" ? estimatedHours : undefined,
    isArchived: typeof isArchived === "boolean" ? isArchived : undefined,
    destinationSqFt: typeof destinationSqFt === "number" ? destinationSqFt : undefined,
  });
  return NextResponse.json({ tenant });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  const role = await getUserRoleForTenant(userId, tenantId);
  if (!role || !["Owner", "TTTAdmin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deleteTenantCascade(tenantId);
  return NextResponse.json({ success: true });
}
