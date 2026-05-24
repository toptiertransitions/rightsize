import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, redeemPartnerPoint } from "@/lib/airtable";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!["TTTManager", "TTTAdmin"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { pointId, note } = body as { pointId?: string; note?: string };
  if (!pointId) return NextResponse.json({ error: "pointId required" }, { status: 400 });

  const point = await redeemPartnerPoint(pointId, userId, note || "");
  return NextResponse.json({ point });
}
