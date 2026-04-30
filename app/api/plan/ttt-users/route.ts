import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getStaffMembers } from "@/lib/airtable";

export async function GET(_req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const members = await getStaffMembers().catch(() => []);
  const active = members.filter(m => m.isActive);

  // Batch-fetch Clerk profiles for profile photos
  const clerkIds = active.map(m => m.clerkUserId).filter(Boolean);
  const clerk = await clerkClient();
  const clerkUsers = clerkIds.length
    ? await clerk.users.getUserList({ userId: clerkIds, limit: 100 }).catch(() => ({ data: [] }))
    : { data: [] };
  const photoMap = new Map(clerkUsers.data.map(u => [u.id, u.imageUrl]));

  const users = active.map(m => ({
    name: m.displayName,
    email: m.email,
    role: m.role,
    clerkUserId: m.clerkUserId,
    phone: m.phone ?? null,
    profileImageUrl: photoMap.get(m.clerkUserId) ?? null,
    weeklySchedule: m.weeklySchedule ?? null,
    timeOff: m.timeOff ?? [],
  }));

  return NextResponse.json({ users });
}
