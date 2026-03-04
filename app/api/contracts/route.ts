import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  getContractsForTenant,
  createContract,
  updateContract,
  getSystemRole,
  getUserRoleForTenant,
  getTenantById,
} from "@/lib/airtable";
import { buildContractSentEmail } from "@/lib/email";
import { Resend } from "resend";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  const [sysRole, tenantRole] = await Promise.all([
    getSystemRole(userId),
    getUserRoleForTenant(userId, tenantId).catch(() => null),
  ]);

  const isManagerOrAdmin = sysRole === "TTTAdmin" || sysRole === "TTTManager";
  const isOwnerOrCollab = tenantRole === "Owner" || tenantRole === "Collaborator";
  if (!isManagerOrAdmin && !isOwnerOrCollab) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contracts = await getContractsForTenant(tenantId);
  return NextResponse.json({ contracts });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTAdmin" && sysRole !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    tenantId,
    templateId,
    contractBody,
    rightsizingHours,
    packingHours,
    unpackingHours,
    rightsizingRate,
    packingRate,
    unpackingRate,
    totalCost,
    send,
    recipientEmail,
    recipientName,
  } = body;

  if (!tenantId || !contractBody) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const signToken = crypto.randomUUID();
  let contract = await createContract({
    tenantId,
    templateId: templateId ?? "",
    contractBody,
    rightsizingHours: rightsizingHours ?? 0,
    packingHours: packingHours ?? 0,
    unpackingHours: unpackingHours ?? 0,
    rightsizingRate: rightsizingRate ?? 0,
    packingRate: packingRate ?? 0,
    unpackingRate: unpackingRate ?? 0,
    totalCost: totalCost ?? 0,
    signToken,
  });

  if (send) {
    const sentAt = new Date().toISOString();
    contract = await updateContract(contract.id, {
      status: "Sent",
      sentAt,
      sentByClerkId: userId,
    });

    // Send signing email to specified recipient
    try {
      const tenant = await getTenantById(tenantId).catch(() => null);
      if (!tenant) throw new Error("Tenant not found");
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const signingUrl = `${appUrl}/sign/${signToken}`;

      const toEmail = recipientEmail as string | undefined;
      const clientName = (recipientName as string | undefined) || toEmail || "Client";

      if (toEmail) {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const fromEmail = process.env.RESEND_FROM_EMAIL ?? "hello@rightsize.app";
        await resend.emails.send({
          from: `Top Tier Transitions <${fromEmail}>`,
          to: toEmail,
          subject: `Your service agreement for ${tenant.name} is ready`,
          html: buildContractSentEmail({
            clientName,
            projectName: tenant.name,
            signingUrl,
            totalCost: totalCost ?? 0,
            rightsizingHours: rightsizingHours ?? 0,
            packingHours: packingHours ?? 0,
            unpackingHours: unpackingHours ?? 0,
          }),
        });
      }
    } catch (e) {
      console.error("Failed to send contract email:", e);
    }
  }

  return NextResponse.json({ contract });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTAdmin" && sysRole !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const contract = await updateContract(id, data);
  return NextResponse.json({ contract });
}
