import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, updateProjectTask, deleteProjectTask } from "@/lib/airtable";

const MANAGER_ROLES = ["TTTManager", "TTTAdmin"];
const ADMIN_ROLES = ["TTTAdmin"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !MANAGER_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { taskId } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const isAdmin = ADMIN_ROLES.includes(sysRole);

  // Managers can only update status, completedAt, completedBy, attachment fields
  // Admins can update any field
  const managerAllowed = new Set(["status", "completedAt", "completedBy", "attachmentUrl", "attachmentName", "attachmentPublicId"]);
  const updates: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(body)) {
    if (isAdmin || managerAllowed.has(key)) {
      updates[key] = val;
    }
  }

  try {
    const task = await updateProjectTask(taskId, updates);
    return NextResponse.json({ task });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !ADMIN_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden — TTTAdmin required" }, { status: 403 });
  }

  const { taskId } = await params;
  try {
    await deleteProjectTask(taskId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
