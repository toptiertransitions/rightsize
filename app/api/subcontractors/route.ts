import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getSubcontractors,
  createSubcontractor,
  updateSubcontractor,
  deleteSubcontractor,
} from "@/lib/airtable";

const ALLOWED_ROLES = ["TTTManager", "TTTAdmin"];

// ─── GET: fetch all subcontractors ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !ALLOWED_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const subcontractors = await getSubcontractors().catch(() => []);
  return NextResponse.json({ subcontractors });
}

// ─── POST: create subcontractor ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !ALLOWED_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, charges, scope, paid, paidDate, tenantId, tenantName } = body;

  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const subcontractor = await createSubcontractor({
    name,
    charges: Number(charges) || 0,
    scope: scope || "",
    paid: paid ?? false,
    paidDate: paidDate || undefined,
    tenantId: tenantId || undefined,
    tenantName: tenantName || undefined,
  });

  return NextResponse.json({ subcontractor });
}

// ─── PATCH: update subcontractor ───────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !ALLOWED_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id, ...data } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const subcontractor = await updateSubcontractor(id, {
    name: data.name,
    charges: data.charges !== undefined ? Number(data.charges) : undefined,
    scope: data.scope,
    paid: data.paid,
    paidDate: data.paidDate !== undefined ? (data.paidDate || null) : undefined,
    tenantId: data.tenantId !== undefined ? (data.tenantId || null) : undefined,
    tenantName: data.tenantName !== undefined ? (data.tenantName || null) : undefined,
  });

  return NextResponse.json({ subcontractor });
}

// ─── DELETE: remove subcontractor ─────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !ALLOWED_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await deleteSubcontractor(id);
  return NextResponse.json({ ok: true });
}
