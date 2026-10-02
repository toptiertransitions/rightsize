import { NextRequest, NextResponse } from "next/server";
import { unregisterDeviceToken } from "@/lib/airtable";

// Best-effort cleanup — called when the app detects it's no longer signed
// in, so a shared/reset device stops getting pushes for the account that
// just signed out. Not calling this is harmless (a stale token just gets
// pruned automatically the next time APNs reports it dead), so this never
// blocks or fails the sign-out flow.
//
// Deliberately doesn't require an active session: by the time the client
// reactively detects sign-out, Clerk's session cookie is already gone, so
// gating this on auth() would always 401. The only thing this does is
// delete the Airtable row matching one exact, already-known, effectively
// unguessable device token — the existing registration flow doesn't
// verify token ownership either (see registerDeviceToken), so this isn't
// a new relaxation of an otherwise-enforced boundary.
export async function POST(req: NextRequest) {
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
