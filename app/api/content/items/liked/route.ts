export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { getAllLikedItemIds } from "@/lib/airtable-content";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ids = await getAllLikedItemIds(userId);
  return NextResponse.json({ ids });
}
