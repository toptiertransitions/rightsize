import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sendPushToClerkUsers } from "@/lib/push-send";

// Sends one test notification to the signed-in user's own devices (iPhone
// and Android), through the same path every real notification uses. Never
// reaches anyone else. Useful for checking a device is set up correctly.
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await sendPushToClerkUsers(
    [userId],
    { title: "Rightsize test notification", body: "Notifications are working on this device. Tap to open your settings.", url: "/notification-settings" },
    { type: "Other" }
  );
  return NextResponse.json({ sent: true });
}
