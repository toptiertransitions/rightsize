import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { deleteShoutout, getShoutout } from "@/lib/shoutouts";

// DELETE: the author or an Admin can remove a shoutout from the feed.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [role, shoutout] = await Promise.all([getSystemRole(userId), getShoutout(id)]);
  if (!shoutout) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role !== "TTTAdmin" && shoutout.authorClerkId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    await deleteShoutout(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[shoutouts DELETE]", e);
    return NextResponse.json({ error: "Couldn't delete" }, { status: 500 });
  }
}
