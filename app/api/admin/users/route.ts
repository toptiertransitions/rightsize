import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isTTTAdmin } from "@/lib/config";

async function checkAdmin() {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) return null;
  return userId;
}

export async function POST(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action, email, clerkUserId } = await req.json();
  const client = await clerkClient();

  if (action === "lookup" && email) {
    const res = await client.users.getUserList({ emailAddress: [email] });
    return NextResponse.json({
      users: res.data.map(u => ({
        id: u.id,
        email: u.emailAddresses[0]?.emailAddress ?? "",
        name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || (u.emailAddresses[0]?.emailAddress ?? "Unknown"),
        imageUrl: u.imageUrl,
      })),
    });
  }

  if (action === "suspend" && clerkUserId) {
    await client.users.banUser(clerkUserId);
    return NextResponse.json({ success: true });
  }

  if (action === "unsuspend" && clerkUserId) {
    await client.users.unbanUser(clerkUserId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
