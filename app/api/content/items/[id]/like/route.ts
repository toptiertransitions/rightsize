import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { getLikeForUser, addLike, removeLike } from "@/lib/airtable-content";

interface Context { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Context) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: contentId } = await params;
  const existingLikeId = await getLikeForUser(contentId, userId);

  if (existingLikeId) {
    await removeLike(existingLikeId, contentId);
    return NextResponse.json({ liked: false });
  } else {
    await addLike(contentId, userId);
    return NextResponse.json({ liked: true });
  }
}

export async function GET(_req: NextRequest, { params }: Context) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: contentId } = await params;
  const existingLikeId = await getLikeForUser(contentId, userId);
  return NextResponse.json({ liked: !!existingLikeId });
}
