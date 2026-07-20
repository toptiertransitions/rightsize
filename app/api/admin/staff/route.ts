import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidateTag } from "next/cache";
import {
  getSystemRole,
  getStaffMembers,
  getStaffMemberById,
  upsertStaffMember,
  updateStaffMember,
  deleteStaffMember,
} from "@/lib/airtable";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

async function requireStaffManage(userId: string) {
  const role = await getSystemRole(userId);
  if (!hasPermission(role, PERMISSIONS.STAFF_MANAGE)) return false;
  return true;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireStaffManage(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const staff = await getStaffMembers();
    return NextResponse.json({ staff });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireStaffManage(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { clerkUserId: string; displayName: string; email: string; role: "TTTStaff" | "TTTManager" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { clerkUserId, displayName, email, role } = body;
  if (!clerkUserId || !displayName || !email || !role) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  // TTTAdmin not assignable via API
  if (role === "TTTAdmin" as string) {
    return NextResponse.json({ error: "TTTAdmin cannot be assigned via API" }, { status: 400 });
  }

  try {
    const member = await upsertStaffMember({ clerkUserId, displayName, email, role, isActive: true });
    revalidateTag("staff-members");
    return NextResponse.json({ member });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireStaffManage(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { id: string; role?: string; isActive?: boolean; displayName?: string; email?: string; phone?: string; hourlyRate?: number | null; address?: string | null; pinColor?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  if (fields.role === "TTTAdmin" as string) {
    return NextResponse.json({ error: "TTTAdmin cannot be assigned via API" }, { status: 400 });
  }

  try {
    // If email is changing, update Clerk too so login + invite emails use the new address
    if (fields.email) {
      const existing = await getStaffMemberById(id);
      if (existing?.clerkUserId && existing.email !== fields.email) {
        const client = await clerkClient();
        try {
          const clerkUser = await client.users.getUser(existing.clerkUserId);
          // Create the new address as primary + verified (admin bypass, no verification email)
          const created = await client.emailAddresses.createEmailAddress({
            userId: existing.clerkUserId,
            emailAddress: fields.email,
            primary: true,
            verified: true,
          });
          // Make it primary
          await client.users.updateUser(existing.clerkUserId, {
            primaryEmailAddressID: created.id,
          });
          // Remove the old primary address
          const oldId = clerkUser.primaryEmailAddressId;
          if (oldId && oldId !== created.id) {
            await client.emailAddresses.deleteEmailAddress(oldId).catch(() => {});
          }
        } catch (clerkErr) {
          console.error("[staff PATCH] Clerk email update failed:", clerkErr);
          return NextResponse.json(
            { error: `Airtable saved but Clerk update failed: ${String(clerkErr)}` },
            { status: 500 }
          );
        }
      }
    }

    const member = await updateStaffMember(id, fields);
    revalidateTag("staff-members");
    return NextResponse.json({ member });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireStaffManage(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    await deleteStaffMember(id);
    revalidateTag("staff-members");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
