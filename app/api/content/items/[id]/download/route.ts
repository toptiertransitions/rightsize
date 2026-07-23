import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { incrementDownloadCount, getContentItemById } from "@/lib/airtable-content";

interface Context { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Context) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await incrementDownloadCount(id);
  const item = await getContentItemById(id);
  return NextResponse.json({ downloadCount: item?.downloadCount ?? 0 });
}
