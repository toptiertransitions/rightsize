import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole, getTenantById } from "@/lib/airtable";
import { sendScheduleModificationRequest } from "@/lib/admin-notifications";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  // Only TTTTeamLead, TTTManager, and TTTAdmin can submit schedule modification requests
  const allowed = ["TTTTeamLead", "TTTManager", "TTTAdmin"];
  if (!sysRole || !allowed.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { tenantId, projectName, request, reason, priority } = body as {
    tenantId: string;
    projectName: string;
    request: string;
    reason?: string;
    priority: "Normal" | "Urgent";
  };

  if (!tenantId || !request?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Fetch requester info
  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId).catch(() => null);
  const requesterName = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || "Team Lead";
  const requesterEmail = clerkUser?.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ?? "";

  // Resolve project name if not provided
  let resolvedProjectName = projectName?.trim();
  if (!resolvedProjectName) {
    const tenant = await getTenantById(tenantId).catch(() => null);
    resolvedProjectName = tenant?.name ?? tenantId;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://app.toptiertransitions.com";
  const planUrl = `${baseUrl}/plan?tenantId=${tenantId}`;

  try {
    await sendScheduleModificationRequest({
      projectName: resolvedProjectName,
      tenantId,
      requesterName,
      requesterEmail,
      request: request.trim(),
      reason: reason?.trim() || undefined,
      priority: priority === "Urgent" ? "Urgent" : "Normal",
      planUrl,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[schedule-request] send failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
