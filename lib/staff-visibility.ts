/**
 * Cross-references staff against Clerk to find accounts that are suspended
 * or have been deleted entirely. Suspension lives only in Clerk
 * (publicMetadata.suspended) — Airtable's StaffRoles.IsActive is a
 * completely separate flag an admin sets independently, so a staff member
 * can be IsActive=true in Airtable while suspended/deleted in Clerk.
 *
 * These staff must be hidden from all Ops scheduling/logic — AI Staff
 * Mapping, Availability, Calendar, Goals, Skills — even though they still
 * pass Airtable's IsActive check.
 */
import { clerkClient } from "@clerk/nextjs/server";

export async function getSuspendedOrDeletedClerkUserIds(clerkUserIds: string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(clerkUserIds.filter(Boolean)));
  if (ids.length === 0) return new Set();
  try {
    const clerk = await clerkClient();
    // Chunk instead of a single capped call — "not found in Clerk's response"
    // is read below as "account deleted," so if staff headcount ever passed
    // one page, real active staff would get silently misclassified as
    // deleted and hidden from Ops scheduling. Clerk's userId filter caps at
    // 100 ids per request regardless of `limit`, so this chunks the query,
    // not just the page size.
    const CHUNK = 100;
    const found = new Map<string, Awaited<ReturnType<typeof clerk.users.getUserList>>["data"][number]>();
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const { data: clerkUsers } = await clerk.users.getUserList({ userId: chunk, limit: CHUNK });
      for (const u of clerkUsers) found.set(u.id, u);
    }
    const excluded = new Set<string>();
    for (const id of ids) {
      const u = found.get(id);
      if (!u) { excluded.add(id); continue; } // Clerk account deleted
      if ((u.publicMetadata as { suspended?: boolean })?.suspended === true) excluded.add(id);
    }
    return excluded;
  } catch {
    // Clerk lookup failed — fail open so a transient API error never wipes
    // out an entire Ops roster.
    return new Set();
  }
}
