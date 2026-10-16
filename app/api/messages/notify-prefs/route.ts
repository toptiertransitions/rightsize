import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getSystemRole } from "@/lib/airtable";
import { isCommsHubRole, canAccessProjectThread } from "@/lib/thread-access";
import { getNotifyPrefs, saveNotifyPrefs, notificationsStoreConfigured } from "@/lib/notify-prefs";

// This person's Inbox notification settings: per-project level and quiet hours.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ prefs: await getNotifyPrefs(userId), available: notificationsStoreConfigured() });
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const schema = z.union([
  z.object({ tenantId: z.string().min(1), level: z.enum(["all", "mentions", "none"]).nullable() }),
  z.object({ quiet: z.object({ enabled: z.boolean(), start: hhmm, end: hhmm }) }),
]);

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!isCommsHubRole(sysRole)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings" }, { status: 400 });

  try {
    if ("tenantId" in parsed.data) {
      if (!(await canAccessProjectThread(userId, sysRole, parsed.data.tenantId))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.json({ prefs: await saveNotifyPrefs(userId, { tenantId: parsed.data.tenantId, level: parsed.data.level }) });
    }
    return NextResponse.json({ prefs: await saveNotifyPrefs(userId, { quiet: parsed.data.quiet }) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save" }, { status: 500 });
  }
}
