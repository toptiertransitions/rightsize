import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createTenant, createMembership, upsertUser, getTenantBySlug } from "@/lib/airtable";
import { slugify } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name: string; email?: string; displayName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, displayName } = body;
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
  const tenant = await createTenant({ name: name.trim(), slug, ownerUserId: userId });

  // Create owner membership
  await createMembership({ tenantId: tenant.id, clerkUserId: userId, role: "Owner" });

  return NextResponse.json({ tenant });
}
