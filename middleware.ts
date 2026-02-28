import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/calculator(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
]);

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  // Protect all non-public routes — redirects to sign-in if not authenticated
  await auth.protect();

  // Admin routes — restrict to TTT admin user IDs
  if (isAdminRoute(req)) {
    const { userId } = await auth();
    const adminIds = (process.env.TTT_ADMIN_USER_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (userId && adminIds.length > 0 && !adminIds.includes(userId)) {
      const url = new URL("/dashboard", req.url);
      return Response.redirect(url);
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
