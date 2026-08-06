import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isTTTAdmin } from "@/lib/config";
import { getEbayAuthUrl } from "@/lib/ebay";

export async function GET() {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = getEbayAuthUrl();
    return NextResponse.redirect(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://rightsize.vercel.app";
    return NextResponse.redirect(`${base}/admin/ebay-setup?error=${encodeURIComponent(msg)}`);
  }
}
