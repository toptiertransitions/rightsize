import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getProjectTasksForTenant, createProjectTask } from "@/lib/airtable";

const MANAGER_ROLES = ["TTTManager", "TTTAdmin"];
const ADMIN_ROLES = ["TTTAdmin"];

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !MANAGER_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  try {
    const tasks = await getProjectTasksForTenant(tenantId);
    return NextResponse.json({ tasks });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !ADMIN_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden — TTTAdmin required" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { tenantId, title, description, dueDate, sortOrder, notes } = body ?? {};
  if (!tenantId || !title?.trim()) {
    return NextResponse.json({ error: "Missing tenantId or title" }, { status: 400 });
  }

  try {
    const task = await createProjectTask({ tenantId, title: title.trim(), description, dueDate, sortOrder: sortOrder ?? 0, notes });
    return NextResponse.json({ task });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
