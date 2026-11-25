// Who can do what with Communities, checked on every API route. Mirrors the
// Ops page (/staff): TTT Sales, Managers and Admins can open it; Managers and
// Admins edit Ops data. Server only.
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getStaffMember, getSystemRole } from "@/lib/airtable";
import { CommunitySetupError } from "./airtable";

export const VIEW_ROLES = ["TTTSales", "TTTManager", "TTTAdmin"];
export const EDIT_ROLES = ["TTTManager", "TTTAdmin"];
export const ARCHIVE_ROLES = ["TTTManager", "TTTAdmin"];

export interface CommunityActor {
  userId: string;
  role: string;
  /** For Updated By and History: display name, then email. */
  name: string;
  canEdit: boolean;
  canArchive: boolean;
}

export const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

export function apiError(status: number, error: string, fields?: Record<string, string>) {
  return NextResponse.json(fields ? { error, fields } : { error }, { status });
}

async function actorName(userId: string): Promise<string> {
  const staff = await getStaffMember(userId).catch(() => null);
  if (staff?.displayName) return staff.email ? `${staff.displayName} (${staff.email})` : staff.displayName;
  try {
    const u = await (await clerkClient()).users.getUser(userId);
    const email = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ?? "";
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ");
    return name ? (email ? `${name} (${email})` : name) : email || userId;
  } catch {
    return userId;
  }
}

/** Returns the actor, or a 401/403 response. `need` is the minimum right. */
export async function requireCommunityAccess(need: "view" | "edit" | "archive"): Promise<CommunityActor | NextResponse> {
  const { userId } = await auth();
  if (!userId) return apiError(401, "Please sign in again.");
  const role = (await getSystemRole(userId).catch(() => null)) ?? "";
  if (!VIEW_ROLES.includes(role)) return apiError(403, "Communities are available to TTT Sales, Managers and Admins.");
  const canEdit = EDIT_ROLES.includes(role);
  const canArchive = ARCHIVE_ROLES.includes(role);
  if (need === "edit" && !canEdit) return apiError(403, "Only TTT Managers and Admins can edit communities.");
  if (need === "archive" && !canArchive) return apiError(403, "Only TTT Managers and Admins can archive or restore communities.");
  return { userId, role, name: need === "view" ? "" : await actorName(userId), canEdit, canArchive };
}

/** Name lookup for view routes that also write (PDF history). */
export const nameFor = (actor: CommunityActor) => (actor.name ? Promise.resolve(actor.name) : actorName(actor.userId));

/** Turns thrown errors into a safe response; Airtable details stay in the logs. */
export function handleRouteError(e: unknown, where: string) {
  if (e instanceof CommunitySetupError) {
    console.error(`[communities] ${where}:`, e.message);
    return apiError(503, "Communities aren't set up in Airtable yet. Ask an Admin to run the community table setup.");
  }
  console.error(`[communities] ${where}:`, e);
  return apiError(500, "Something went wrong saving to Airtable. Try again in a moment.");
}
