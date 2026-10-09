// Ties a user (and their self-serve project) to a community brand. Used by
// the /join/[slug] link, the "community code" field in onboarding, and the
// join cookie claimed when the first project is created. Server-only.
//
// Writes: Clerk publicMetadata.brandSlug (read by the layout), the Airtable
// Users.CommunityBrandIds list, and Tenant.CommunityBrandId on the user's own
// non-TTT projects that don't have a brand yet. Never touches TTT projects
// (admins assign those from Tenant Config) and never replaces a brand an
// admin already set.
import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { revalidateTag } from "next/cache";
import { AIRTABLE_TABLES } from "@/lib/config";
import { getMembershipsForUser, getTenantById, updateTenant } from "@/lib/airtable";
import { getAllBrands } from "./data";
import { JOIN_COOKIE, verifyValue } from "./cookies";
import type { CommunityBrand } from "./shared";

async function addBrandToUserRecord(clerkUserId: string, brandId: string): Promise<void> {
  const base = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLES.USERS)}`;
  const headers = { Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}`, "Content-Type": "application/json" };
  const q = new URLSearchParams({ filterByFormula: `{ClerkUserId} = "${clerkUserId.replace(/"/g, "")}"`, maxRecords: "1" });
  const res = await fetch(`${base}?${q}`, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`Users lookup failed (${res.status})`);
  const rec = ((await res.json()) as { records: Array<{ id: string; fields: Record<string, unknown> }> }).records[0];
  if (!rec) return; // created later by upsertUser; the Clerk metadata still carries the brand
  const ids = String(rec.fields.CommunityBrandIds ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.includes(brandId)) return;
  const upd = await fetch(`${base}/${rec.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ fields: { CommunityBrandIds: [...ids, brandId].join(",") } }),
  });
  if (!upd.ok) throw new Error(`Users update failed (${upd.status})`);
}

export async function attachBrandToUser(clerkUserId: string, brand: CommunityBrand): Promise<void> {
  const clerk = await clerkClient();
  await clerk.users.updateUserMetadata(clerkUserId, { publicMetadata: { brandSlug: brand.slug } });
  await addBrandToUserRecord(clerkUserId, brand.id).catch((e) => console.error("[brands] user record:", e));

  const memberships = await getMembershipsForUser(clerkUserId).catch(() => []);
  let changed = false;
  for (const m of memberships) {
    if (m.role !== "Owner") continue;
    const t = await getTenantById(m.tenantId).catch(() => null);
    if (!t || t.isTTT === true || t.communityBrandId) continue;
    await updateTenant(t.id, { communityBrandId: brand.id }).catch((e) => console.error("[brands] tenant:", e));
    changed = true;
  }
  if (changed) revalidateTag("tenants");
}

/** The Active brand held in the join cookie, if any. */
export async function getJoinCookieBrand(): Promise<CommunityBrand | null> {
  const jar = await cookies();
  const id = verifyValue(jar.get(JOIN_COOKIE)?.value);
  if (!id) return null;
  const brand = (await getAllBrands()).find((b) => b.id === id);
  return brand?.status === "Active" ? brand : null;
}

/** Attaches the join-cookie brand to the user, then clears the cookie.
 * Only callable from server actions / route handlers (it deletes a cookie). */
export async function claimJoinBrand(clerkUserId: string): Promise<CommunityBrand | null> {
  try {
    const brand = await getJoinCookieBrand();
    if (!brand) return null;
    await attachBrandToUser(clerkUserId, brand);
    (await cookies()).delete(JOIN_COOKIE);
    return brand;
  } catch (e) {
    console.error("[brands] claim join brand failed:", e);
    return null;
  }
}
