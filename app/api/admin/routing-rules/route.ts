import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getRoutingRules, createRoutingRule, updateRoutingRule, deleteRoutingRule } from "@/lib/airtable";
import type { PrimaryRoute, VendorType, RoutingRule } from "@/lib/types";

async function requireAdmin(userId: string) {
  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTAdmin") return false;
  return true;
}

export async function GET(_req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireAdmin(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rules = await getRoutingRules();
  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireAdmin(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const rule = await createRoutingRule({
    primaryRoute: body.primaryRoute as PrimaryRoute,
    vendorType: body.vendorType as VendorType,
    minCondition: body.minCondition as RoutingRule["minCondition"],
    matchCategories: body.matchCategories ?? "",
    matchSizeClasses: body.matchSizeClasses ?? "",
    matchFragility: body.matchFragility ?? "",
    minValueMid: Number(body.minValueMid) || 0,
    maxValueMid: Number(body.maxValueMid) || 0,
    priority: Number(body.priority) || 10,
    isActive: body.isActive ?? true,
  });
  return NextResponse.json({ rule });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireAdmin(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { id, ...data } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const rule = await updateRoutingRule(id, {
    primaryRoute: data.primaryRoute as PrimaryRoute,
    vendorType: data.vendorType as VendorType,
    minCondition: data.minCondition as RoutingRule["minCondition"],
    matchCategories: data.matchCategories,
    matchSizeClasses: data.matchSizeClasses,
    matchFragility: data.matchFragility,
    minValueMid: data.minValueMid !== undefined ? Number(data.minValueMid) : undefined,
    maxValueMid: data.maxValueMid !== undefined ? Number(data.maxValueMid) : undefined,
    priority: data.priority !== undefined ? Number(data.priority) : undefined,
    isActive: data.isActive,
  });
  return NextResponse.json({ rule });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireAdmin(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await deleteRoutingRule(id);
  return NextResponse.json({ success: true });
}
