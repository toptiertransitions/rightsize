import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { saveCalendarToken } from "@/lib/airtable";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(
      new URL(`/admin/crm?calendar=error&msg=${encodeURIComponent(error)}`, appUrl)
    );
  }
  if (!code) {
    return NextResponse.redirect(
      new URL("/admin/crm?calendar=error&msg=missing_code", appUrl)
    );
  }

  const redirectUri = `${appUrl}/api/admin/calendar-auth/callback`;

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );

  try {
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      // Google only returns a refresh_token on first consent — if missing, revoke & retry
      return NextResponse.redirect(
        new URL("/admin/crm?calendar=error&msg=no_refresh_token_visit_calendar_auth_again", appUrl)
      );
    }
    await saveCalendarToken(tokens.refresh_token);
    return NextResponse.redirect(new URL("/admin/crm?calendar=connected", appUrl));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.redirect(
      new URL(`/admin/crm?calendar=error&msg=${encodeURIComponent(msg)}`, appUrl)
    );
  }
}
