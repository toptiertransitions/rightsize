import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole, getIntakeForm, saveIntakeForm } from "@/lib/airtable";
import type { IntakeForm } from "@/lib/types";

const ALLOWED_ROLES = ["TTTStaff", "TTTManager", "TTTAdmin"];

async function checkAccess(userId: string): Promise<boolean> {
  const sysRole = await getSystemRole(userId).catch(() => null);
  return sysRole !== null && ALLOWED_ROLES.includes(sysRole);
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await checkAccess(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  const form = await getIntakeForm(tenantId).catch(() => null);
  return NextResponse.json({ form });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await checkAccess(userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { tenantId: string; form: IntakeForm };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { tenantId, form } = body;
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  // Stamp updatedAt and updatedBy from the authenticated user
  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId).catch(() => null);
  const updatedByEmail = clerkUser?.emailAddresses.find(
    (e) => e.id === clerkUser.primaryEmailAddressId,
  )?.emailAddress ?? "";
  const updatedByName =
    `${clerkUser?.firstName ?? ""} ${clerkUser?.lastName ?? ""}`.trim() || updatedByEmail;

  const stamped: IntakeForm = {
    ...form,
    updatedAt: new Date().toISOString(),
    updatedByName,
    updatedByEmail,
  };

  const saved = await saveIntakeForm(tenantId, stamped);
  return NextResponse.json({ form: saved });
}
