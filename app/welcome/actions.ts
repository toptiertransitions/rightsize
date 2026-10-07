"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole, getTenantById, getUserRoleForTenant, updateTenant, upsertUser } from "@/lib/airtable";
import { step3Schema, step4Schema, type Step3Input, type Step4Input } from "@/lib/onboarding/schema";
import { logOnboardingEvent } from "@/lib/onboarding/analytics";
import { z } from "zod";

// Welcome onboarding for TTT clients (accepted a TTT project invite, first
// Rightsize account). Same screens/timing as self-serve minus rooms, sqft,
// service interests, and "how did you hear". Answers go to the project's
// onboarding fields only; the addresses, dates, and plan staff entered are
// separate fields and are never touched.

async function requireTTTClient(tenantId: string): Promise<{ userId: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const [role, tenant, sysRole] = await Promise.all([
    getUserRoleForTenant(userId, tenantId).catch(() => null),
    getTenantById(tenantId).catch(() => null),
    getSystemRole(userId).catch(() => null),
  ]);
  if (!role || !tenant || tenant.isTTT !== true || sysRole) throw new Error("Forbidden");
  return { userId };
}

const nameSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
});

export async function saveWelcomeName(tenantId: string, input: { firstName: string; lastName: string }): Promise<void> {
  const { userId } = await requireTTTClient(tenantId);
  const parsed = nameSchema.parse(input);
  const clerk = await clerkClient();
  await clerk.users.updateUser(userId, { firstName: parsed.firstName, lastName: parsed.lastName });
  const u = await clerk.users.getUser(userId);
  const email = u.emailAddresses.find(e => e.id === u.primaryEmailAddressId)?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? userId;
  await upsertUser({ clerkUserId: userId, email, name: `${parsed.firstName} ${parsed.lastName}`.trim() }).catch(() => {});
  logOnboardingEvent("step_completed", { step: 1, tenantId, flow: "ttt-welcome" });
}

export async function saveWelcomeTimeline(tenantId: string, input: Step3Input): Promise<void> {
  await requireTTTClient(tenantId);
  const parsed = step3Schema.parse(input);
  await updateTenant(tenantId, { timelineType: parsed.timelineType, timelineValue: parsed.timelineValue });
  logOnboardingEvent("step_completed", { step: 2, tenantId, flow: "ttt-welcome" });
}

export async function saveWelcomeDestination(tenantId: string, input: Step4Input): Promise<void> {
  await requireTTTClient(tenantId);
  const parsed = step4Schema.parse(input);
  await updateTenant(tenantId, {
    destinationType: parsed.destinationType,
    destinationZip: parsed.destinationZip || null,
    destinationCommunity: parsed.destinationCommunity || null,
    destinationCommunityOther: parsed.destinationCommunityOther || null,
  });
  logOnboardingEvent("step_completed", { step: 3, tenantId, flow: "ttt-welcome" });
}

/** Marks this person's welcome as done so it never shows again. */
export async function finishWelcome(tenantId: string): Promise<void> {
  const { userId } = await requireTTTClient(tenantId);
  const clerk = await clerkClient();
  await clerk.users.updateUserMetadata(userId, { publicMetadata: { tttOnboardingDone: true } });
  logOnboardingEvent("onboarding_completed", { tenantId, flow: "ttt-welcome" });
}

/** Project name and the signed-in person's name, for the welcome screens. */
export async function getWelcomeContext(tenantId: string): Promise<{ projectName: string; firstName: string; lastName: string }> {
  const { userId } = await requireTTTClient(tenantId);
  const [tenant, clerk] = await Promise.all([getTenantById(tenantId), clerkClient()]);
  const u = await clerk.users.getUser(userId).catch(() => null);
  return { projectName: tenant?.name ?? "your", firstName: u?.firstName ?? "", lastName: u?.lastName ?? "" };
}
