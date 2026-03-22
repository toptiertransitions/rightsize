import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { isTTTAdmin } from "@/lib/config";
import { upsertStaffMember, getMembershipsForUser, deleteMembership, getStaffMember, deleteStaffMember } from "@/lib/airtable";
import { buildStaffWelcomeEmail } from "@/lib/email";

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
    if (!["TTTStaff", "TTTManager", "TTTSales"].includes(role)) {
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
      // 3. Generate a 7-day sign-in link
      const token = await client.signInTokens.createSignInToken({ userId: newUser.id, expiresInSeconds: 604800 });

      // 4. Send branded welcome email directly to the new staff member
      const roleLabel = role === "TTTManager" ? "Manager" : role === "TTTSales" ? "Sales" : "Staff";
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { error: emailError } = await resend.emails.send({
        from: "hello@toptiertransitions.com",
        to: newEmail,
        subject: "Welcome to Top Tier Transitions — You're In",
        html: buildStaffWelcomeEmail({ firstName, roleLabel, signInUrl: token.url }),
      });
      if (emailError) console.error("[createStaff] email error:", emailError);

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
        emailSent: !emailError,
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

  if (action === "deleteUser" && clerkUserId) {
    if (clerkUserId === adminId) {
      return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
    }
    if (isTTTAdmin(clerkUserId)) {
      return NextResponse.json({ error: "Cannot delete a TTT Admin account" }, { status: 400 });
    }
    try {
      // 1. Remove all Airtable project memberships
      const memberships = await getMembershipsForUser(clerkUserId);
      await Promise.all(memberships.map(m => deleteMembership(m.id)));

      // 2. Remove StaffMember record if one exists
      const staffMember = await getStaffMember(clerkUserId);
      if (staffMember) await deleteStaffMember(staffMember.id);

      // 3. Delete from Clerk (must be last — point of no return)
      await client.users.deleteUser(clerkUserId);

      return NextResponse.json({ success: true });
    } catch (e) {
      console.error("deleteUser error:", e);
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
