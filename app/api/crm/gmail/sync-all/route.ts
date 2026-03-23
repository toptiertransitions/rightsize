import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getAllGmailTokens } from "@/lib/airtable";
import { runGmailSyncAll } from "@/lib/gmail";

export async function POST(req: NextRequest) {
  void req;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTManager" && sysRole !== "TTTAdmin" && sysRole !== "TTTSales") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch all connected Gmail accounts and sync every one
  const tokens = await getAllGmailTokens().catch(() => []);
  if (tokens.length === 0) {
    return NextResponse.json(
      { error: "No Gmail accounts are connected. Connect Gmail in CRM → Settings first." },
      { status: 400 },
    );
  }

  const clerkUserIds = tokens.map((t) => t.clerkUserId);
  const result = await runGmailSyncAll(clerkUserIds);
  return NextResponse.json(result);
}
