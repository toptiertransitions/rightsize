import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getBrandBySlug } from "@/lib/brands/data";
import { attachBrandToUser } from "@/lib/brands/attach";
import { JOIN_COOKIE, JOIN_COOKIE_MAX_AGE, signValue } from "@/lib/brands/cookies";
import { RESIDENT_INVITE_COOKIE, claimResidentInvite, getResidentInviteById, inviteCookieValue, verifyInviteToken } from "@/lib/brands/residentInvites";
import { getMembershipsForUser, getSystemRole, getTenantById } from "@/lib/airtable";

// "Get started" from /join/[slug]. Signed out: remember the community in a
// signed cookie and go to sign-up (or sign-in, which comes back here).
// Signed in: attach the community now and go home. Staff and Partner Portal
// users are never branded, so for them this is just a redirect.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug.toLowerCase()).catch(() => null);
  if (!brand || brand.status !== "Active") return NextResponse.redirect(new URL(`/join/${encodeURIComponent(slug)}`, req.url));

  // Emailed resident invite (?ri=)
  const inviteId = verifyInviteToken(req.nextUrl.searchParams.get("ri"));
  const invite = inviteId ? await getResidentInviteById(inviteId).catch(() => null) : null;
  const residentInvite = invite && invite.brandId === brand.id && invite.status === "Invited" ? invite : null;

  const { userId, sessionClaims } = await auth();
  if (userId) {
    const meta = sessionClaims?.public_metadata as { userType?: string } | undefined;
    const sysRole = await getSystemRole(userId).catch(() => null);
    if (!sysRole && meta?.userType !== "partner") {
      await attachBrandToUser(userId, brand).catch((e) => console.error("[join] attach failed:", e));
      // Already signed in when opening an emailed invite: it's claimed by
      // their own self-serve project (if they have one yet)
      if (residentInvite) {
        const memberships = await getMembershipsForUser(userId).catch(() => []);
        for (const m of memberships) {
          if (m.role !== "Owner") continue;
          const t = await getTenantById(m.tenantId).catch(() => null);
          if (!t || t.isTTT === true) continue;
          await claimResidentInvite({ clerkUserId: userId, email: "", tenantId: t.id, inviteId: residentInvite.id });
          break;
        }
      }
    }
    return NextResponse.redirect(new URL(meta?.userType === "partner" ? "/partner/home" : "/home", req.url));
  }

  // Signed out: remember the invite for onboarding (marks it Joined and adds
  // their move date) and fill in their email on sign-up
  const dest = req.nextUrl.searchParams.get("signin")
    ? `/sign-in?redirect_url=${encodeURIComponent(`/join/${brand.slug}/start${residentInvite ? `?ri=${encodeURIComponent(req.nextUrl.searchParams.get("ri") ?? "")}` : ""}`)}&brand=${brand.slug}`
    : `/sign-up?brand=${brand.slug}${residentInvite ? `&email=${encodeURIComponent(residentInvite.email)}` : ""}`;
  const res = NextResponse.redirect(new URL(dest, req.url));
  if (residentInvite) {
    res.cookies.set(RESIDENT_INVITE_COOKIE, inviteCookieValue(residentInvite.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: JOIN_COOKIE_MAX_AGE,
    });
  }
  res.cookies.set(JOIN_COOKIE, signValue(brand.id, JOIN_COOKIE_MAX_AGE), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: JOIN_COOKIE_MAX_AGE,
  });
  return res;
}
