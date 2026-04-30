import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getStaffMembers } from "@/lib/airtable";

export async function GET(_req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const members = await getStaffMembers().catch(() => []);
  const users = members
    .filter(m => m.isActive)
    .map(m => ({
      name: m.displayName,
      email: m.email,
      role: m.role,
      clerkUserId: m.clerkUserId,
      phone: m.phone ?? null,
      profileImageUrl: m.profileImageUrl ?? null,
      weeklySchedule: m.weeklySchedule ?? null,
      timeOff: m.timeOff ?? [],
    }));

  return NextResponse.json({ users });
}
