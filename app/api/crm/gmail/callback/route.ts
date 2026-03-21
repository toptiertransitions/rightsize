import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { exchangeCodeForTokens, runGmailSyncAll } from "@/lib/gmail";
import { saveGmailToken } from "@/lib/airtable";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const clerkUserId = req.nextUrl.searchParams.get("state");

  if (!code || !clerkUserId) {
    return NextResponse.redirect(new URL("/crm?tab=settings&error=missing_params", req.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const hasRefreshToken = !!tokens.refreshToken;
    console.log(`[gmail/callback] clerkUserId=${clerkUserId} email=${tokens.email} hasRefreshToken=${hasRefreshToken}`);
    await saveGmailToken(clerkUserId, tokens);

    // Kick off a full email history sync in the background after redirect
    after(async () => {
      try {
        await runGmailSyncAll(clerkUserId);
      } catch (err) {
        console.error("[gmail/callback] Auto-sync failed:", err);
      }
    });

    const dest = new URL("/crm?tab=settings&connected=1", req.url);
    dest.searchParams.set("hasRefreshToken", hasRefreshToken ? "1" : "0");
    return NextResponse.redirect(dest);
  } catch (err) {
    console.error("Gmail OAuth callback error:", err);
    return NextResponse.redirect(new URL("/crm?tab=settings&error=oauth_failed", req.url));
  }
}
