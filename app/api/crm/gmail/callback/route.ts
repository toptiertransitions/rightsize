import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { exchangeCodeForTokens, runGmailSyncAll } from "@/lib/gmail";
import { saveGmailToken } from "@/lib/airtable";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const clerkUserId = req.nextUrl.searchParams.get("state");
  const googleError = req.nextUrl.searchParams.get("error"); // e.g. "access_denied"

  // Google rejected the auth (user denied, app not published, etc.)
  if (googleError) {
    console.error(`[gmail/callback] Google returned error: ${googleError}`);
    return NextResponse.redirect(new URL(`/crm?tab=settings&error=oauth_failed`, req.url));
  }

  if (!code || !clerkUserId) {
    console.error(`[gmail/callback] Missing code or state. code=${!!code} state=${clerkUserId}`);
    return NextResponse.redirect(new URL("/crm?tab=settings&error=missing_params", req.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    console.log(`[gmail/callback] clerkUserId=${clerkUserId} email=${tokens.email} hasRefreshToken=${!!tokens.refreshToken} redirectUri=${process.env.GOOGLE_REDIRECT_URI}`);
    if (!tokens.refreshToken) {
      console.warn(`[gmail/callback] No refresh token returned for ${clerkUserId} — token will be short-lived`);
    }
    await saveGmailToken(clerkUserId, { ...tokens, hasSendScope: true });

    // Kick off a full email history sync in the background after redirect
    after(async () => {
      try {
        await runGmailSyncAll(clerkUserId);
      } catch (err) {
        console.error("[gmail/callback] Auto-sync failed:", err);
      }
    });

    return NextResponse.redirect(new URL("/crm?tab=settings&connected=1", req.url));
  } catch (err) {
    console.error("[gmail/callback] Token exchange or save failed:", err);
    return NextResponse.redirect(new URL("/crm?tab=settings&error=oauth_failed", req.url));
  }
}
