import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/gmail";
import { saveGmailToken } from "@/lib/airtable";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const clerkUserId = req.nextUrl.searchParams.get("state");

  if (!code || !clerkUserId) {
    return NextResponse.redirect(new URL("/crm?tab=settings&error=missing_params", req.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await saveGmailToken(clerkUserId, tokens);
    return NextResponse.redirect(new URL("/crm?tab=settings&connected=1", req.url));
  } catch (err) {
    console.error("Gmail OAuth callback error:", err);
    return NextResponse.redirect(new URL("/crm?tab=settings&error=oauth_failed", req.url));
  }
}
