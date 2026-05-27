import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { getAllLedgerEntriesForPartner } from "@/lib/airtable-loyalty";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTAdmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const partnerId = req.nextUrl.searchParams.get("partnerId");
  if (!partnerId) return NextResponse.json({ error: "Missing partnerId" }, { status: 400 });

  const entries = await getAllLedgerEntriesForPartner(partnerId);
  return NextResponse.json({ entries });
}
