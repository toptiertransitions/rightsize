import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { createNoteComment } from "@/lib/airtable-notes";

const TTT_ROLES = ["TTTStaff", "TTTManager", "TTTAdmin", "TTTSales"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ noteId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !TTT_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { noteId } = await params;
  const { content, authorName, authorPhotoUrl } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "Missing content" }, { status: 400 });

  const comment = await createNoteComment({
    noteId,
    authorClerkId: userId,
    authorName: authorName || "Staff",
    authorPhotoUrl: authorPhotoUrl || undefined,
    content: content.trim(),
  });

  return NextResponse.json({ comment });
}
