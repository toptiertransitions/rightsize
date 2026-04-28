import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getOutreachAudiences,
  createOutreachAudience,
  updateOutreachAudience,
  deleteOutreachAudience,
} from "@/lib/airtable";

async function requireSalesRole(userId: string) {
  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "")) return null;
  return role;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireSalesRole(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const audiences = await getOutreachAudiences(userId);
  return NextResponse.json({ audiences });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireSalesRole(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, description, contactType, filterJson, shared } = body;
  if (!name || !contactType) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

  const audience = await createOutreachAudience({
    name,
    description: description ?? "",
    contactType,
    filterJson: filterJson ?? "{}",
    ownerClerkId: userId,
    shared: shared ?? false,
    contactCountCached: 0,
  });
  return NextResponse.json({ audience });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireSalesRole(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { id, ...data } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const audience = await updateOutreachAudience(id, data);
  return NextResponse.json({ audience });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireSalesRole(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await deleteOutreachAudience(id);
  return NextResponse.json({ ok: true });
}
