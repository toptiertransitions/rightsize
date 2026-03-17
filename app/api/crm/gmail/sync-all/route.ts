import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getGmailToken, getAnyGmailToken } from "@/lib/airtable";
import { runGmailSyncAll } from "@/lib/gmail";

export async function POST(req: NextRequest) {
  void req;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTManager" && sysRole !== "TTTAdmin" && sysRole !== "TTTSales") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Use the calling user's Gmail token if available, otherwise fall back to any connected account
  let token = await getGmailToken(userId).catch(() => null);
  if (!token) {
    token = await getAnyGmailToken().catch(() => null);
  }

  if (!token) {
    return NextResponse.json(
      { error: "No Gmail account is connected. Please connect Gmail in CRM → Settings first." },
      { status: 400 }
    );
  }

  // Run the sync using whichever account's token is available
  const result = await runGmailSyncAll(token.clerkUserId);
  return NextResponse.json(result);
}
