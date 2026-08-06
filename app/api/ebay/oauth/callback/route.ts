import { NextRequest, NextResponse } from "next/server";
import { exchangeEbayCode } from "@/lib/ebay";

export async function GET(req: NextRequest) {
  const base  = process.env.NEXT_PUBLIC_APP_URL ?? "https://rightsize.vercel.app";
  const error = req.nextUrl.searchParams.get("error");
  const code  = req.nextUrl.searchParams.get("code");

  if (error) {
    return NextResponse.redirect(`${base}/admin/ebay-setup?error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${base}/admin/ebay-setup?error=no_code`);
  }

  try {
    const { refreshToken } = await exchangeEbayCode(code);
    return NextResponse.redirect(
      `${base}/admin/ebay-setup?refresh_token=${encodeURIComponent(refreshToken)}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token exchange failed";
    return NextResponse.redirect(`${base}/admin/ebay-setup?error=${encodeURIComponent(msg)}`);
  }
}
