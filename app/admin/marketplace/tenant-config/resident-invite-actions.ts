"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getSystemRole } from "@/lib/airtable";
import { canAccessMarketplaceAdmin } from "@/lib/marketplace/permissions";
import { getBrandById } from "@/lib/brands/data";
import { cancelResidentInvite, createAndSendResidentInvite, resendResidentInvite } from "@/lib/brands/residentInvites";
import { residentInviteSchema, type ResidentInviteInput, type ResidentInviteResult } from "@/lib/brands/residentInviteShared";

// Tenant Config > a brand: TTT Admins and Managers email residents an
// invite to the community's branded app (lib/brands/residentInvites.ts).
async function context(brandId: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");
  if (!canAccessMarketplaceAdmin(await getSystemRole(userId).catch(() => null))) throw new Error("Not permitted");
  const brand = await getBrandById(brandId);
  if (!brand) throw new Error("Tenant not found");
  if (brand.status !== "Active") throw new Error("Publish this tenant before inviting residents.");
  const user = await currentUser().catch(() => null);
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Top Tier Transitions";
  return { brand, inviter: { name, email: user?.primaryEmailAddress?.emailAddress, clerkUserId: userId, side: "Top Tier" as const } };
}

function done(brandId: string): ResidentInviteResult {
  revalidatePath(`/admin/marketplace/tenant-config/${brandId}`);
  return { ok: true };
}

function fail(e: unknown): ResidentInviteResult {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

export async function adminInviteResidentAction(brandId: string, input: ResidentInviteInput): Promise<ResidentInviteResult> {
  try {
    const parsed = residentInviteSchema.parse(input);
    const { brand, inviter } = await context(brandId);
    await createAndSendResidentInvite({ brand, ...parsed, inviter });
    return done(brandId);
  } catch (e) {
    return fail(e);
  }
}

export async function adminResendResidentInviteAction(brandId: string, inviteId: string): Promise<ResidentInviteResult> {
  try {
    const { brand, inviter } = await context(brandId);
    await resendResidentInvite(brand, inviteId, inviter);
    return done(brandId);
  } catch (e) {
    return fail(e);
  }
}

export async function adminCancelResidentInviteAction(brandId: string, inviteId: string): Promise<ResidentInviteResult> {
  try {
    const { brand } = await context(brandId);
    await cancelResidentInvite(brand, inviteId);
    return done(brandId);
  } catch (e) {
    return fail(e);
  }
}
