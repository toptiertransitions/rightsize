import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getInventoryContainers, createInventoryContainer, updateInventoryContainer, deleteInventoryContainer } from "@/lib/airtable";

async function guardManager(userId: string) {
  const role = await getSystemRole(userId).catch(() => null);
  return role === "TTTManager" || role === "TTTAdmin";
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await guardManager(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const containers = await getInventoryContainers().catch(() => []);
  return NextResponse.json({ containers });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await guardManager(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { name, containerType, tenantId } = body;
  if (!name || !containerType) return NextResponse.json({ error: "name and containerType required" }, { status: 400 });

  const container = await createInventoryContainer({ name, containerType, tenantId });
  return NextResponse.json({ container });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await guardManager(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const container = await updateInventoryContainer(id, {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.items !== undefined ? { items: updates.items } : {}),
    ...(updates.tenantId !== undefined ? { tenantId: updates.tenantId } : {}),
  });
  return NextResponse.json({ container });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await guardManager(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await deleteInventoryContainer(id);
  return NextResponse.json({ ok: true });
}
