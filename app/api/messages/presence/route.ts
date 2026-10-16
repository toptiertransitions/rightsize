import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { setViewing } from "@/lib/notify-prefs";

// Heartbeat from an open conversation: while it's on screen, that
// conversation's pushes are skipped for this person. Expires on its own
// (~45s) if the app is closed without saying so.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = await req.json().catch(() => ({ tenantId: null }));
  await setViewing(userId, typeof tenantId === "string" && tenantId ? tenantId : null).catch(() => {});
  return NextResponse.json({ ok: true });
}
