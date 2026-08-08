export const runtime = "nodejs";
export const maxDuration = 300; // Airtable-heavy — allow up to 5 min

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, backfillAllShopperCategoryInterests } from "@/lib/airtable";

export async function POST(_req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTAdmin") {
    return NextResponse.json({ error: "Forbidden — TTTAdmin only" }, { status: 403 });
  }

  const result = await backfillAllShopperCategoryInterests();
  return NextResponse.json(result);
}
