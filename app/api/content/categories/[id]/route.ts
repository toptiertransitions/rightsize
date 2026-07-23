import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { updateContentCategory, deleteContentCategory } from "@/lib/airtable-content";

interface Context { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Context) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const category = await updateContentCategory(id, {
    name: body.name,
    color: body.color,
    sortOrder: body.sortOrder,
  });
  return NextResponse.json({ category });
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden — TTTAdmin only" }, { status: 403 });
  }

  const { id } = await params;
  await deleteContentCategory(id);
  return NextResponse.json({ success: true });
}
