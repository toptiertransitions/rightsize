import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isTTTAdmin } from "@/lib/config";
import { upsertStaffMember } from "@/lib/airtable";

async function checkAdmin() {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) return null;
  return userId;
}

export async function POST(req: NextRequest) {
  const adminId = await checkAdmin();
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { action, email, clerkUserId } = body;
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

  if (action === "passwordReset" && clerkUserId) {
    try {
      const token = await client.signInTokens.createSignInToken({ userId: clerkUserId, expiresInSeconds: 86400 });
      return NextResponse.json({ url: token.url });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  if (action === "createStaff") {
    const { firstName, lastName, email: newEmail, role } = body;
    if (!firstName || !newEmail || !role) {
      return NextResponse.json({ error: "firstName, email, and role are required" }, { status: 400 });
    }
    if (!["TTTStaff", "TTTManager"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    try {
      // 1. Create Clerk user (no password — they'll use the sign-in link)
      const newUser = await client.users.createUser({
        firstName,
        lastName: lastName || undefined,
        emailAddress: [newEmail],
        skipPasswordRequirement: true,
      });
      // 2. Register in Airtable StaffMembers
      const displayName = [firstName, lastName].filter(Boolean).join(" ");
      await upsertStaffMember({ clerkUserId: newUser.id, displayName, email: newEmail, role, isActive: true });
      // 3. Generate a 7-day sign-in link they can use to set up their account
      const token = await client.signInTokens.createSignInToken({ userId: newUser.id, expiresInSeconds: 604800 });
      return NextResponse.json({
        user: {
          clerkUserId: newUser.id,
          email: newEmail,
          name: displayName,
          imageUrl: newUser.imageUrl,
          createdAt: new Date(newUser.createdAt).toISOString(),
          banned: false,
          memberships: [],
          systemRole: role,
        },
        signInUrl: token.url,
      });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  if (action === "impersonate" && clerkUserId) {
    try {
      const actorToken = await client.actorTokens.create({
        userId: clerkUserId,
        actor: { sub: adminId },
      });
      if (!actorToken.token) {
        return NextResponse.json({ error: "Actor token was not generated" }, { status: 500 });
      }
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
      const url = `${appUrl}/home?__clerk_ticket=${actorToken.token}`;
      return NextResponse.json({ token: actorToken.token, url });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
