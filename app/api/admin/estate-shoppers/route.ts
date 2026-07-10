import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getAllShoppers, createShopper, updateShopper, deleteShopper } from "@/lib/airtable";
import type { EstateSaleShopperSource } from "@/lib/types";

async function requireAdmin(req?: NextRequest) {
  const { userId } = await auth();
  if (!userId) return null;
  const role = await getSystemRole(userId);
  if (role !== "TTTAdmin" && role !== "TTTManager") return null;
  return userId;
}

export async function GET() {
  const uid = await requireAdmin();
  if (!uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const shoppers = await getAllShoppers().catch(() => []);
  return NextResponse.json({ shoppers });
}

export async function POST(req: NextRequest) {
  const uid = await requireAdmin();
  if (!uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, email, phone, zip, city, source, categoryInterests, notes, optOut } = body;

  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  try {
    const shopper = await createShopper({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || undefined,
      zip: zip?.trim() || undefined,
      city: city?.trim() || undefined,
      source: (source || "Manual") as EstateSaleShopperSource,
      categoryInterests: categoryInterests || undefined,
      notes: notes?.trim() || undefined,
      optOut: !!optOut,
    });
    return NextResponse.json({ shopper });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const uid = await requireAdmin();
  if (!uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const updated = await updateShopper(id, {
      name: fields.name?.trim(),
      email: fields.email?.trim().toLowerCase(),
      phone: fields.phone?.trim() || undefined,
      zip: fields.zip?.trim() || undefined,
      city: fields.city?.trim() || undefined,
      source: fields.source as EstateSaleShopperSource | undefined,
      categoryInterests: fields.categoryInterests || undefined,
      notes: fields.notes?.trim() || undefined,
      optOut: fields.optOut !== undefined ? !!fields.optOut : undefined,
    });
    return NextResponse.json({ shopper: updated });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const uid = await requireAdmin();
  if (!uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await deleteShopper(id);
  return NextResponse.json({ ok: true });
}
