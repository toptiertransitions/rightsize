import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

// Public, tiny: does the SERVER see this request as signed in yet? Used by
// /continue right after sign-up, so it only opens a protected page once the
// new session cookie is actually reaching the server (the iOS app's web view
// can lag a moment behind the page here).
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  return NextResponse.json({ signedIn: !!userId }, { headers: { "Cache-Control": "no-store" } });
}
