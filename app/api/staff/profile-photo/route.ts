import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole, getStaffMembers } from "@/lib/airtable";

export const maxDuration = 60;

// POST (multipart: clerkUserId, file) sets a staff member's profile picture.
// The profile picture is the ONE staff photo: it's their avatar in Rightsize
// and the headshot clients see on the Partners page when they're the Team
// Lead. Managers/Admins can set it for anyone on Staff Goals. Replace only;
// there is deliberately no remove.
const ALLOWED_ROLES = ["TTTManager", "TTTAdmin"];
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId);
  if (!role || !ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const clerkUserId = form?.get("clerkUserId");
  if (!(file instanceof Blob) || typeof clerkUserId !== "string" || !clerkUserId) {
    return NextResponse.json({ error: "Missing photo" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "That isn't an image" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That photo is too large" }, { status: 400 });

  const staff = await getStaffMembers();
  if (!staff.some((s) => s.isActive && s.clerkUserId === clerkUserId)) {
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  }

  try {
    const user = await (await clerkClient()).users.updateUserProfileImage(clerkUserId, { file });
    console.log(`[staff/profile-photo] ${userId} set profile photo for ${clerkUserId}`);
    return NextResponse.json({ photoUrl: user.imageUrl });
  } catch (e) {
    console.error("[staff/profile-photo]", e);
    return NextResponse.json({ error: "Couldn't save the photo" }, { status: 500 });
  }
}
