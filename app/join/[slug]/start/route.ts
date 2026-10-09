import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { getBrandBySlug } from "@/lib/brands/data";
import { attachBrandToUser } from "@/lib/brands/attach";
import { JOIN_COOKIE, JOIN_COOKIE_MAX_AGE, signValue } from "@/lib/brands/cookies";

// "Get started" from /join/[slug]. Signed out: remember the community in a
// signed cookie and go to sign-up (or sign-in, which comes back here).
// Signed in: attach the community now and go home. Staff and Partner Portal
// users are never branded, so for them this is just a redirect.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug.toLowerCase()).catch(() => null);
  if (!brand || brand.status !== "Active") return NextResponse.redirect(new URL(`/join/${encodeURIComponent(slug)}`, req.url));

  const { userId, sessionClaims } = await auth();
  if (userId) {
    const meta = sessionClaims?.public_metadata as { userType?: string } | undefined;
    const sysRole = await getSystemRole(userId).catch(() => null);
    if (!sysRole && meta?.userType !== "partner") {
      await attachBrandToUser(userId, brand).catch((e) => console.error("[join] attach failed:", e));
    }
    return NextResponse.redirect(new URL(meta?.userType === "partner" ? "/partner/home" : "/home", req.url));
  }

  const dest = req.nextUrl.searchParams.get("signin")
    ? `/sign-in?redirect_url=${encodeURIComponent(`/join/${brand.slug}/start`)}&brand=${brand.slug}`
    : `/sign-up?brand=${brand.slug}`;
  const res = NextResponse.redirect(new URL(dest, req.url));
  res.cookies.set(JOIN_COOKIE, signValue(brand.id, JOIN_COOKIE_MAX_AGE), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: JOIN_COOKIE_MAX_AGE,
  });
  return res;
}
