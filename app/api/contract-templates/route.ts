import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getContractTemplates,
  createContractTemplate,
  updateContractTemplate,
  deleteContractTemplate,
  getSystemRole,
} from "@/lib/airtable";

async function requireAdmin(userId: string) {
  const sysRole = await getSystemRole(userId);
  return sysRole === "TTTAdmin";
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireAdmin(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const templates = await getContractTemplates();
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireAdmin(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, body, isActive } = await req.json();
  if (!name?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "Name and body are required" }, { status: 400 });
  }

  const template = await createContractTemplate({ name: name.trim(), body: body.trim(), isActive: isActive ?? true });
  return NextResponse.json({ template });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireAdmin(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, name, body, isActive } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const template = await updateContractTemplate(id, {
    name: typeof name === "string" ? name.trim() : undefined,
    body: typeof body === "string" ? body.trim() : undefined,
    isActive: typeof isActive === "boolean" ? isActive : undefined,
  });
  return NextResponse.json({ template });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireAdmin(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await deleteContractTemplate(id);
  return NextResponse.json({ success: true });
}
