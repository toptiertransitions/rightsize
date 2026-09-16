import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { acknowledgeProjectMessage } from "@/lib/airtable-messages";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTManager" && sysRole !== "TTTAdmin" && sysRole !== "TTTSales") {
    return NextResponse.json({ error: "Forbidden — Manager, Admin, or Sales only" }, { status: 403 });
  }

  const { id } = await params;
  const message = await acknowledgeProjectMessage(id, userId);
  return NextResponse.json({ message });
}
