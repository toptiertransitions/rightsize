import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  getContractsForTenant,
  createContract,
  updateContract,
  deleteContract,
  getSystemRole,
  getUserRoleForTenant,
  getTenantById,
  getOpportunitiesForTenant,
  updateOpportunity,
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
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "")) {
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
    lineItems,
    send,
    recipientEmail,
    recipientName,
    autoSendDeposit,
    includeServiceDescriptions,
    includeServiceHours,
    notInScope,
  } = body;

  if (!tenantId) {
    return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });
  }

  const signToken = crypto.randomUUID();
  let contract;
  try {
    contract = await createContract({
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
      lineItems: Array.isArray(lineItems) && lineItems.length > 0 ? lineItems : undefined,
      recipientEmail: recipientEmail ?? undefined,
      autoSendDeposit: autoSendDeposit ?? false,
      includeServiceDescriptions: includeServiceDescriptions ?? false,
      includeServiceHours: includeServiceHours ?? false,
      notInScope: notInScope ?? undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create contract";
    console.error("createContract error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

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
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
      const signingUrl = `${appUrl}/sign/${signToken}`;

      const toEmail = recipientEmail as string | undefined;
      const clientName = (recipientName as string | undefined) || toEmail || "Client";

      if (toEmail) {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const fromEmail = process.env.RESEND_FROM_EMAIL ?? "hello@rightsize.app";
        const emailLineItems: { serviceName: string; hours: number }[] = Array.isArray(lineItems)
          ? lineItems.map((li: { serviceName: string; hours: number; description?: string }) => ({ serviceName: li.serviceName, hours: li.hours, description: li.description }))
          : [];
        await resend.emails.send({
          from: `Top Tier Transitions <${fromEmail}>`,
          to: toEmail,
          subject: `Your service agreement for ${tenant.name} is ready`,
          html: buildContractSentEmail({
            clientName,
            projectName: tenant.name,
            signingUrl,
            totalCost: totalCost ?? 0,
            lineItems: emailLineItems,
            includeServiceHours: includeServiceHours ?? false,
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
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id, action, tenantId: actionTenantId, send: sendFlag, recipientEmail: patchRecipient, recipientName: patchRecipientName, includeServiceHours: patchIncludeHours, tenantId: patchTenantId, ...data } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // setPrimary: archive all currently-Signed contracts for this tenant, then mark this one.
  // If the target is "Sent" (waiting for client signature) leave it as Sent so the client
  // can still sign; otherwise promote Draft/Archived to Signed.
  if (action === "setPrimary" && actionTenantId) {
    const all = await getContractsForTenant(actionTenantId);
    const target = all.find((c) => c.id === id);
    const newStatus = target?.status === "Sent" ? "Sent" : "Signed";
    await Promise.all(
      all
        .filter((c) => c.status === "Signed" && c.id !== id)
        .map((c) => updateContract(c.id, { status: "Archived" }))
    );
    const contract = await updateContract(id, { status: newStatus });

    // Only advance opportunity to Won when the contract is actually Signed,
    // not when it is merely designated as the primary Sent/Draft contract.
    if (newStatus === "Signed") {
      try {
        const opps = await getOpportunitiesForTenant(actionTenantId).catch(() => []);
        const primaryContract = all.find((c) => c.id === id);
        const signedValue = primaryContract?.totalCost ?? contract.totalCost;
        const active = opps.filter((o) => o.stage !== "Won" && o.stage !== "Lost");
        await Promise.all(
          active.map((o) =>
            updateOpportunity(o.id, {
              stage: "Won",
              wonAt: new Date().toISOString(),
              estimatedValue: signedValue,
            }).catch(() => null)
          )
        );
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({ contract });
  }

  // If send: true, rotate token + mark Sent + email (used when sending an existing Draft)
  if (sendFlag && patchRecipient) {
    const newSignToken = crypto.randomUUID();
    const sentAt = new Date().toISOString();

    // Supersede any other Sent contracts for this tenant
    if (patchTenantId) {
      try {
        const allContracts = await getContractsForTenant(patchTenantId);
        await Promise.all(
          allContracts
            .filter((c) => c.id !== id && c.status === "Sent")
            .map((c) => updateContract(c.id, { status: "Superseded" }).catch(() => null))
        );
      } catch { /* non-fatal */ }
    }

    const contract = await updateContract(id, {
      ...data,
      signToken: newSignToken,
      status: "Sent",
      sentAt,
      sentByClerkId: userId,
      recipientEmail: patchRecipient,
    });

    try {
      const tenantId = patchTenantId ?? contract.tenantId;
      const tenant = await getTenantById(tenantId).catch(() => null);
      if (tenant) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
        const signingUrl = `${appUrl}/sign/${newSignToken}`;
        const clientName = patchRecipientName || patchRecipient;
        const emailLineItems = (contract.lineItems ?? []).map((li) => ({
          serviceName: li.serviceName,
          hours: li.hours,
          description: li.description,
        }));
        const resend = new Resend(process.env.RESEND_API_KEY);
        const fromEmail = process.env.RESEND_FROM_EMAIL ?? "hello@rightsize.app";
        await resend.emails.send({
          from: `Top Tier Transitions <${fromEmail}>`,
          to: patchRecipient,
          subject: `Your service agreement for ${tenant.name} is ready`,
          html: buildContractSentEmail({
            clientName,
            projectName: tenant.name,
            signingUrl,
            totalCost: contract.totalCost,
            lineItems: emailLineItems,
            includeServiceHours: patchIncludeHours ?? false,
          }),
        });
      }
    } catch (e) {
      console.error("Failed to send draft contract email:", e);
    }

    return NextResponse.json({ contract });
  }

  const contract = await updateContract(id, data);
  return NextResponse.json({ contract });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await deleteContract(id);
  return NextResponse.json({ ok: true });
}
