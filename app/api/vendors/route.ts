import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getVendorsForTenant,
  createVendor,
  updateVendor,
  deleteVendor,
  getVendorById,
  getUserRoleForTenant,
  getSystemRole,
} from "@/lib/airtable";
import type { VendorType } from "@/lib/types";

const EDIT_ROLES = ["Owner", "Collaborator", "TTTStaff", "TTTManager", "TTTAdmin"];

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  const role = await getUserRoleForTenant(userId, tenantId);
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const vendors = await getVendorsForTenant(tenantId);
    return NextResponse.json({ vendors });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    tenantId: string;
    vendorType: VendorType;
    vendorName: string;
    pocName: string;
    email: string;
    phone?: string;
    arrangement?: string;
    date1Label?: string;
    date1?: string;
    date2Label?: string;
    date2?: string;
    date3Label?: string;
    date3?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { tenantId, vendorType, vendorName, email } = body;
  if (!tenantId || !vendorType || !vendorName || !email) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole)) {
    const role = await getUserRoleForTenant(userId, tenantId);
    if (!role || !EDIT_ROLES.includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const vendor = await createVendor(body);
    return NextResponse.json({ vendor });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    id: string;
    vendorType?: VendorType;
    vendorName?: string;
    pocName?: string;
    email?: string;
    phone?: string;
    arrangement?: string;
    date1Label?: string;
    date1?: string;
    date2Label?: string;
    date2?: string;
    date3Label?: string;
    date3?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await getVendorById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sysRolePatch = await getSystemRole(userId).catch(() => null);
  if (!sysRolePatch || !["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRolePatch)) {
    const role = await getUserRoleForTenant(userId, existing.tenantId);
    if (!role || !EDIT_ROLES.includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const vendor = await updateVendor(id, fields);
    return NextResponse.json({ vendor });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await getVendorById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sysRoleDel = await getSystemRole(userId).catch(() => null);
  if (!sysRoleDel || !["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRoleDel)) {
    const role = await getUserRoleForTenant(userId, existing.tenantId);
    if (!role || !EDIT_ROLES.includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    await deleteVendor(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
