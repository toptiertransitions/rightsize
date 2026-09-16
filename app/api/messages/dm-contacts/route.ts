import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole, getStaffMembers } from "@/lib/airtable";
import { isCommsHubRole } from "@/lib/thread-access";
import { getSuspendedOrDeletedClerkUserIds } from "@/lib/staff-visibility";

const MAX_RESULTS = 20;

// Autocomplete search for "Messages Just for Me" — any active internal TTT
// user, excluding yourself and suspended/deleted accounts.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!isCommsHubRole(sysRole)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();

  const allStaff = await getStaffMembers().catch(() => []);
  const candidates = allStaff.filter(s =>
    s.isActive &&
    s.clerkUserId !== userId &&
    isCommsHubRole(s.role) &&
    (q === "" || s.displayName.toLowerCase().includes(q))
  );

  const excludedIds = await getSuspendedOrDeletedClerkUserIds(candidates.map(s => s.clerkUserId));
  const eligible = candidates.filter(s => !excludedIds.has(s.clerkUserId)).slice(0, MAX_RESULTS);

  let photoByClerkId = new Map<string, string>();
  if (eligible.length > 0) {
    try {
      const clerk = await clerkClient();
      const { data: clerkUsers } = await clerk.users.getUserList({ userId: eligible.map(s => s.clerkUserId), limit: 100 });
      photoByClerkId = new Map(clerkUsers.map(u => [u.id, u.imageUrl]));
    } catch { /* non-fatal — fall back to initials */ }
  }

  const contacts = eligible.map(s => ({
    id: s.clerkUserId,
    name: s.displayName,
    photoUrl: photoByClerkId.get(s.clerkUserId) || undefined,
  }));

  return NextResponse.json({ contacts });
}
