import { NextRequest, NextResponse } from "next/server";
import { exchangeQBOCode } from "@/lib/qbo";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const realmId = searchParams.get("realmId");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/admin/contract-services?qbo=error&msg=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code || !realmId) {
    return NextResponse.redirect(
      new URL("/admin/contract-services?qbo=error&msg=missing_params", req.url)
    );
  }

  try {
    await exchangeQBOCode(code, realmId);
    return NextResponse.redirect(
      new URL("/admin/contract-services?qbo=connected", req.url)
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.redirect(
      new URL(`/admin/contract-services?qbo=error&msg=${encodeURIComponent(msg)}`, req.url)
    );
  }
}
