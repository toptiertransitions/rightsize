import { NextRequest, NextResponse } from "next/server";
import { exchangeQBOCode } from "@/lib/qbo";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const realmId = searchParams.get("realmId");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/admin/contract-services?qbo=error&msg=${encodeURIComponent(error)}`, req.url)
    );
  }

  // Validate CSRF state token
  const expectedState = req.cookies.get("qbo_oauth_state")?.value;
  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(
      new URL("/admin/contract-services?qbo=error&msg=invalid_state", req.url)
    );
  }

  if (!code || !realmId) {
    return NextResponse.redirect(
      new URL("/admin/contract-services?qbo=error&msg=missing_params", req.url)
    );
  }

  try {
    await exchangeQBOCode(code, realmId);
    const res = NextResponse.redirect(
      new URL("/admin/contract-services?qbo=connected", req.url)
    );
    // Clear the CSRF cookie
    res.cookies.delete("qbo_oauth_state");
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.redirect(
      new URL(`/admin/contract-services?qbo=error&msg=${encodeURIComponent(msg)}`, req.url)
    );
  }
}
