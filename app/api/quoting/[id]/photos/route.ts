export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getTenantById, updateTenant } from "@/lib/airtable";
import type { ItemPhoto } from "@/lib/types";

async function requireAccess(userId: string) {
  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole)) return false;
  return true;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireAccess(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { url, publicId } = body as { url?: string; publicId?: string };
  if (!url || !publicId) return NextResponse.json({ error: "Missing url or publicId" }, { status: 400 });

  const tenant = await getTenantById(id).catch(() => null);
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing: ItemPhoto[] = tenant.quotePhotos ?? [];
  const updated = [...existing, { url, publicId }];
  await updateTenant(id, { quotePhotos: updated });

  return NextResponse.json({ photos: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireAccess(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { publicId } = body as { publicId?: string };
  if (!publicId) return NextResponse.json({ error: "Missing publicId" }, { status: 400 });

  const tenant = await getTenantById(id).catch(() => null);
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = (tenant.quotePhotos ?? []).filter((p) => p.publicId !== publicId);
  await updateTenant(id, { quotePhotos: updated });

  return NextResponse.json({ photos: updated });
}
