"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidateTag } from "next/cache";
import {
  getSystemRole,
  getMembershipsForUser,
  getUserRoleForTenant,
  getTenantById,
  getTenantBySlug,
  createTenant,
  createMembership,
  updateTenant,
  upsertUser,
  createRoom,
} from "@/lib/airtable";
import { slugify } from "@/lib/utils";
import {
  step1Schema, step2Schema, step3Schema, step4Schema, step5Schema, step6Schema,
  type Step1Input, type Step2Input, type Step3Input, type Step4Input, type Step5Input, type Step6Input,
} from "@/lib/onboarding/schema";
import { logOnboardingEvent } from "@/lib/onboarding/analytics";
import { sendNewUserAdminNotification } from "@/lib/admin-notifications";
import type { RoomType, Tenant } from "@/lib/types";

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      const isRateLimit = /rate limit|429|too many requests/i.test(msg);
      if (!isRateLimit || i === attempts - 1) throw e;
      await new Promise(r => setTimeout(r, 300 * 2 ** i));
    }
  }
  throw lastErr;
}

async function requireOnboardingUser(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole) throw new Error("Forbidden");
  return userId;
}

// Guards every step-N action: the caller must own the tenant, it must be a
// non-TTT project (never an invited TTT client's project), and it must not
// already be complete — the same three checks getOnboardingState() applies
// when deciding whether to even show the page, kept in sync deliberately.
async function requireOwnedOnboardingTenant(tenantId: string): Promise<{ userId: string; tenant: Tenant }> {
  const userId = await requireOnboardingUser();
  const role = await getUserRoleForTenant(userId, tenantId).catch(() => null);
  if (role !== "Owner") throw new Error("Forbidden");
  const tenant = await getTenantById(tenantId).catch(() => null);
  if (!tenant) throw new Error("Project not found");
  if (tenant.isTTT === true) throw new Error("Forbidden");
  if (tenant.onboardingComplete === true) throw new Error("Onboarding already complete");
  return { userId, tenant };
}

export async function submitStep1(input: Step1Input): Promise<{ tenantId: string }> {
  const userId = await requireOnboardingUser();
  const parsed = step1Schema.parse(input);

  const clerk = await clerkClient();
  await clerk.users.updateUser(userId, { firstName: parsed.firstName, lastName: parsed.lastName });
  const clerkUser = await clerk.users.getUser(userId);
  const email =
    clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ?? userId;
  const fullName = `${parsed.firstName} ${parsed.lastName}`.trim();
  await upsertUser({ clerkUserId: userId, email, name: fullName }).catch(() => {});

  // Idempotent: resume an existing in-progress self-serve project instead of
  // creating a second one if the user goes back or refreshes Step 1.
  const memberships = await getMembershipsForUser(userId).catch(() => []);
  for (const m of memberships) {
    const t = await getTenantById(m.tenantId).catch(() => null);
    if (t && t.isTTT !== true && t.onboardingComplete !== true) {
      await withRetry(() => updateTenant(t.id, { currentZip: parsed.currentZip, onboardingCurrentStep: 2 }));
      await clerk.users.updateUserMetadata(userId, { publicMetadata: { onboardingComplete: false } });
      logOnboardingEvent("step_completed", { step: 1, tenantId: t.id, resumed: true });
      return { tenantId: t.id };
    }
  }

  let slug = slugify(email) || `client-${userId}`;
  const existingSlug = await getTenantBySlug(slug).catch(() => null);
  if (existingSlug) slug = `${slug}-${Date.now().toString(36)}`;

  const tenant = await withRetry(() => createTenant({
    name: email,
    slug,
    ownerUserId: userId,
    isTTT: false,
    currentZip: parsed.currentZip,
    onboardingCurrentStep: 2,
    onboardingComplete: false,
  }));
  await withRetry(() => createMembership({ tenantId: tenant.id, clerkUserId: userId, role: "Owner" }));
  await clerk.users.updateUserMetadata(userId, { publicMetadata: { onboardingComplete: false } });

  // Sent directly here rather than relying solely on the Clerk user.created
  // webhook — that webhook fires before this project/tenant exists, so it
  // can only ever label a self-serve signup as a generic "unknown" user
  // with no project info. This fires once, at the point a real NonTTTClient
  // project actually exists, with proper labeling. Best-effort, never blocks.
  sendNewUserAdminNotification({
    fullName,
    email,
    imageUrl: clerkUser.imageUrl,
    userType: "client",
    roleLabel: "Self-Serve Client (NonTTT)",
    projectName: tenant.name,
    projectAddress: parsed.currentZip ? `Zip ${parsed.currentZip}` : null,
  }).catch((e) => console.error("New self-serve client admin notification failed:", e));

  logOnboardingEvent("step_completed", { step: 1, tenantId: tenant.id, resumed: false });
  revalidateTag("tenants");
  return { tenantId: tenant.id };
}

export async function submitStep2(tenantId: string, input: Step2Input): Promise<void> {
  const { tenant } = await requireOwnedOnboardingTenant(tenantId);
  const parsed = step2Schema.parse(input);
  await withRetry(() => updateTenant(tenant.id, {
    serviceInterests: parsed.serviceInterests,
    appOnlyIntent: parsed.appOnlyIntent,
    onboardingCurrentStep: 3,
  }));
  logOnboardingEvent("step_completed", { step: 2, tenantId: tenant.id });
}

export async function submitStep3(tenantId: string, input: Step3Input): Promise<void> {
  const { tenant } = await requireOwnedOnboardingTenant(tenantId);
  const parsed = step3Schema.parse(input);
  await withRetry(() => updateTenant(tenant.id, {
    timelineType: parsed.timelineType,
    timelineValue: parsed.timelineValue,
    onboardingCurrentStep: 4,
  }));
  logOnboardingEvent("step_completed", { step: 3, tenantId: tenant.id });
}

export async function submitStep4(tenantId: string, input: Step4Input): Promise<void> {
  const { tenant } = await requireOwnedOnboardingTenant(tenantId);
  const parsed = step4Schema.parse(input);
  await withRetry(() => updateTenant(tenant.id, {
    destinationType: parsed.destinationType,
    destinationZip: parsed.destinationZip || null,
    destinationCommunity: parsed.destinationCommunity || null,
    destinationCommunityOther: parsed.destinationCommunityOther || null,
    onboardingCurrentStep: 5,
  }));
  logOnboardingEvent("step_completed", { step: 4, tenantId: tenant.id });
}

export async function submitStep5(tenantId: string, input: Step5Input): Promise<void> {
  const { tenant } = await requireOwnedOnboardingTenant(tenantId);
  const parsed = step5Schema.parse(input);
  await withRetry(() => updateTenant(tenant.id, {
    sqftRange: parsed.sqftRange,
    sqftExact: parsed.sqftExact ?? null,
    homeDensity: parsed.homeDensity,
    onboardingCurrentStep: 6,
  }));
  logOnboardingEvent("step_completed", { step: 5, tenantId: tenant.id });
}

function roomTypeForSpaceKey(key: string): RoomType {
  const map: Record<string, RoomType> = {
    kitchen: "Kitchen",
    living_room: "Living Room",
    dining_room: "Dining Room",
    family_room: "Family Room",
    office: "Office/Study",
    laundry: "Laundry",
    basement: "Basement",
    attic: "Attic",
    garage: "Garage",
    storage_unit: "Storage Unit",
    patio: "Patio/Outdoor",
    guest_room: "Guest Room",
  };
  return map[key] ?? "Other";
}

// Step 6 + completion are one submit — Step 7 has no inputs of its own, it's
// just the confirmation screen, so there's no reason to round-trip twice.
export async function completeOnboarding(tenantId: string, input: Step6Input): Promise<{ tenantId: string }> {
  const { userId, tenant } = await requireOwnedOnboardingTenant(tenantId);
  const parsed = step6Schema.parse(input);

  await withRetry(() => updateTenant(tenant.id, {
    bedrooms: parsed.bedrooms,
    bathrooms: parsed.bathrooms,
    onboardingCurrentStep: 7,
  }));

  const roomsToCreate: Array<{ name: string; roomType: RoomType }> = [];
  for (let i = 0; i < parsed.bedrooms; i++) {
    roomsToCreate.push({ name: i === 0 ? "Primary Bedroom" : `Bedroom ${i + 1}`, roomType: i === 0 ? "Master Bedroom" : "Bedroom" });
  }
  const wholeBaths = Math.floor(parsed.bathrooms);
  const hasHalfBath = parsed.bathrooms - wholeBaths === 0.5;
  for (let i = 0; i < wholeBaths; i++) {
    roomsToCreate.push({ name: i === 0 ? "Primary Bathroom" : `Bathroom ${i + 1}`, roomType: "Bathroom" });
  }
  if (hasHalfBath) roomsToCreate.push({ name: "Half Bath", roomType: "Half Bath" });
  for (const space of parsed.spaces.filter(s => s.on)) {
    roomsToCreate.push({ name: space.name, roomType: roomTypeForSpaceKey(space.key) });
  }

  await Promise.all(
    roomsToCreate.map(r => withRetry(() =>
      createRoom({ tenantId: tenant.id, name: r.name, roomType: r.roomType, squareFeet: 0, density: "Medium" })
    ))
  );

  await withRetry(() => updateTenant(tenant.id, { onboardingComplete: true }));

  const clerk = await clerkClient();
  await clerk.users.updateUserMetadata(userId, { publicMetadata: { onboardingComplete: true } });

  logOnboardingEvent("onboarding_completed", { tenantId: tenant.id, roomCount: roomsToCreate.length });
  revalidateTag("tenants");
  return { tenantId: tenant.id };
}
