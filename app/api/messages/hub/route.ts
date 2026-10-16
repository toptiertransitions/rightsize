import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { isCommsHubRole } from "@/lib/thread-access";
import { getHubData } from "@/lib/messaging-hub";

// Everything the Inbox conversation list needs, in one call.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!isCommsHubRole(sysRole)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    return NextResponse.json(await getHubData(userId, sysRole));
  } catch (e) {
    console.error("[messages/hub] failed:", e);
    return NextResponse.json({ error: "Couldn't load your messages" }, { status: 500 });
  }
}
