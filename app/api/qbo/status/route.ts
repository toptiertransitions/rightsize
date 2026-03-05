import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getQBOToken } from "@/lib/airtable";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTAdmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const token = await getQBOToken().catch(() => null);
  if (!token) return NextResponse.json({ connected: false });

  return NextResponse.json({
    connected: true,
    companyName: token.companyName,
    realmId: token.realmId,
  });
}
