import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getAllDiscountCodes,
  getDiscountCodeByCode,
  createDiscountCode,
  updateDiscountCode,
  deleteDiscountCode,
  getContractsByDiscountCodeId,
  getTenantById,
} from "@/lib/airtable";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const code = req.nextUrl.searchParams.get("code");
  const usageId = req.nextUrl.searchParams.get("usageId");

  // Validate a single code (used by the quoting UI)
  if (code) {
    const discount = await getDiscountCodeByCode(code).catch(() => null);
    if (!discount) return NextResponse.json({ error: "Code not found" }, { status: 404 });
    if (!discount.isActive) return NextResponse.json({ error: "This discount code is inactive" }, { status: 410 });
    if (discount.expiresAt && new Date(discount.expiresAt) < new Date()) {
      return NextResponse.json({ error: "This discount code has expired" }, { status: 410 });
    }
    return NextResponse.json({ discount });
  }

  // Get usage for a specific code (used by admin accordion)
  if (usageId) {
    const contracts = await getContractsByDiscountCodeId(usageId).catch(() => []);
    const withTenants = await Promise.all(
      contracts.map(async (c) => {
        const tenant = await getTenantById(c.tenantId).catch(() => null);
        return {
          contractId: c.id,
          tenantName: tenant?.name ?? c.tenantId,
          status: c.status,
          discountAmount: c.discountAmount ?? 0,
          totalCost: c.totalCost,
          createdAt: c.createdAt,
        };
      })
    );
    return NextResponse.json({ usage: withTenants });
  }

  const codes = await getAllDiscountCodes().catch(() => []);
  return NextResponse.json({ codes });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !["TTTAdmin", "TTTManager"].includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { code, label, discountPercent, maxDiscount, expiresAt, isActive } = body;

  if (!code?.trim() || !label?.trim() || !discountPercent) {
    return NextResponse.json({ error: "Code, label, and discount percent are required" }, { status: 400 });
  }
  if (discountPercent < 1 || discountPercent > 100) {
    return NextResponse.json({ error: "Discount percent must be between 1 and 100" }, { status: 400 });
  }

  // Check for duplicate code
  const existing = await getDiscountCodeByCode(code).catch(() => null);
  if (existing) return NextResponse.json({ error: "A code with that name already exists" }, { status: 409 });

  const discount = await createDiscountCode({
    code,
    label,
    discountPercent: Number(discountPercent),
    maxDiscount: maxDiscount ? Number(maxDiscount) : undefined,
    expiresAt: expiresAt || undefined,
    isActive: isActive !== false,
  });

  return NextResponse.json({ discount }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !["TTTAdmin", "TTTManager"].includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id, code, label, discountPercent, maxDiscount, expiresAt, isActive } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const discount = await updateDiscountCode(id, {
    ...(code !== undefined ? { code } : {}),
    ...(label !== undefined ? { label } : {}),
    ...(discountPercent !== undefined ? { discountPercent: Number(discountPercent) } : {}),
    ...(maxDiscount !== undefined ? { maxDiscount: maxDiscount ? Number(maxDiscount) : null } : {}),
    ...(expiresAt !== undefined ? { expiresAt: expiresAt || null } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
  });

  return NextResponse.json({ discount });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !["TTTAdmin", "TTTManager"].includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await deleteDiscountCode(id);
  return NextResponse.json({ ok: true });
}
