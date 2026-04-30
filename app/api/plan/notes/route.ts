import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { getProjectNotes, createProjectNote } from "@/lib/airtable-notes";

const TTT_ROLES = ["TTTStaff", "TTTManager", "TTTAdmin", "TTTSales"];

async function assertTTT(userId: string) {
  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !TTT_ROLES.includes(sysRole)) return null;
  return sysRole;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await assertTTT(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  const notes = await getProjectNotes(tenantId);
  return NextResponse.json({ notes });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await assertTTT(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { tenantId, content, authorName, authorPhotoUrl } = await req.json();
  if (!tenantId || !content?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const note = await createProjectNote({
    tenantId,
    authorClerkId: userId,
    authorName: authorName || "Staff",
    authorPhotoUrl: authorPhotoUrl || undefined,
    content: content.trim(),
  });

  return NextResponse.json({ note });
}
