import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { getAvailableChannels } from "@/lib/thread-access";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  const channels = await getAvailableChannels(userId, sysRole, tenantId);
  return NextResponse.json({ channels });
}
