import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { unregisterDeviceToken } from "@/lib/airtable";

// Best-effort cleanup — called on sign-out so a shared/reset device stops
// receiving pushes meant for the account that just signed out. Not calling
// this is harmless (a stale token just gets pruned automatically the next
// time APNs reports it dead), so this never blocks or fails the sign-out flow.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.token) return NextResponse.json({ error: "token is required" }, { status: 400 });

  await unregisterDeviceToken(body.token);
  return NextResponse.json({ success: true });
}
