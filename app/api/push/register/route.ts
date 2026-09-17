import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { registerDeviceToken } from "@/lib/airtable";

// Called once per app launch by the native client after it obtains (or
// refreshes) its APNs device token. Any authenticated user may register a
// device — push eligibility is decided at send time by who we choose to
// notify, not by who's allowed to hold a token.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { token?: string; platform?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token, platform } = body;
  if (!token || (platform !== "iOS" && platform !== "Android")) {
    return NextResponse.json({ error: "token and platform (iOS|Android) are required" }, { status: 400 });
  }

  await registerDeviceToken({ token, clerkUserId: userId, platform });
  return NextResponse.json({ success: true });
}
