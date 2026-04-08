import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getClientContacts, createClientContact, updateClientContact, deleteClientContact, findClientContactByName } from "@/lib/airtable";

async function requireCRMAccess(userId: string) {
  const sysRole = await getSystemRole(userId);
  return sysRole === "TTTSales" || sysRole === "TTTManager" || sysRole === "TTTAdmin";
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireCRMAccess(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const contacts = await getClientContacts();
  return NextResponse.json({ contacts });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireCRMAccess(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const upsert = req.nextUrl.searchParams.get("upsert") === "true";
  if (upsert && body.name) {
    const existing = await findClientContactByName(body.name);
    if (existing) {
      // Strip empty strings so CSV import never overwrites existing email/phone with blanks
      const updateData = Object.fromEntries(
        Object.entries(body).filter(([, v]) => v !== "" && v !== null && v !== undefined)
      );
      const contact = await updateClientContact(existing.id, updateData);
      return NextResponse.json({ contact });
    }
  }
  const contact = await createClientContact(body);
  return NextResponse.json({ contact });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireCRMAccess(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  // Never overwrite email/phone with empty string — blank values are ignored
  if (data.email === "") delete data.email;
  if (data.phone === "") delete data.phone;
  const contact = await updateClientContact(id, data);
  return NextResponse.json({ contact });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireCRMAccess(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await deleteClientContact(id);
  return NextResponse.json({ ok: true });
}
