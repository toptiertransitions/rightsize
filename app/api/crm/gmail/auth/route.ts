import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { getGmailAuthUrl } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.GOOGLE_CRM_CLIENT_ID || !process.env.GOOGLE_CRM_CLIENT_SECRET) {
    return NextResponse.redirect(new URL("/crm?tab=settings&error=oauth_failed", req.url));
  }

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTManager" && sysRole !== "TTTAdmin" && sysRole !== "TTTSales") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Derive redirect URI from the incoming request so it's always correct
  // regardless of whether GOOGLE_REDIRECT_URI is set in env.
  const redirectUri = `${req.nextUrl.origin}/api/crm/gmail/callback`;
  const url = getGmailAuthUrl(userId, redirectUri);
  return NextResponse.redirect(url);
}
