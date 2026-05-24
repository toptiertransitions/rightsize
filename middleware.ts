import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/calculator(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/invite(.*)",
  "/api/invites/(.*)",
  "/api/mcp",
  "/api/square/webhook",
  "/api/storefront/(.*)",
  "/api/contracts/sign",
  "/api/cron/(.*)",
  "/sign/(.*)",
  "/pay/(.*)",
  "/suspended",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
    const { sessionClaims } = await auth();
    const meta = sessionClaims?.public_metadata as { suspended?: boolean; userType?: string } | undefined;

    if (meta?.suspended === true) {
      return NextResponse.redirect(new URL("/suspended", req.url));
    }

    // Partner users belong exclusively in the partner portal
    const path = req.nextUrl.pathname;
    if (
      meta?.userType === "partner" &&
      !path.startsWith("/partner") &&
      !path.startsWith("/api/")
    ) {
      return NextResponse.redirect(new URL("/partner/home", req.url));
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
