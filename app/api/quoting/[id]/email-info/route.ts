export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import {
  getSystemRole,
  getTenantById,
  getRoomsForTenant,
  getOpportunitiesForTenant,
  getContractsForTenant,
} from "@/lib/airtable";
import { buildQuoteInfoEmail } from "@/lib/email";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const [tenant, rooms, opportunities, contracts] = await Promise.all([
    getTenantById(id).catch(() => null),
    getRoomsForTenant(id).catch(() => []),
    getOpportunitiesForTenant(id).catch(() => []),
    getContractsForTenant(id).catch(() => []),
  ]);

  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Look up the requesting user's name and email from Clerk
  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId).catch(() => null);
  const recipientName = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || "Team Member";
  const recipientEmail = clerkUser?.emailAddresses?.[0]?.emailAddress;

  if (!recipientEmail) {
    return NextResponse.json({ error: "Could not determine your email address" }, { status: 400 });
  }

  const totalRoomSqFt = rooms.reduce((s, r) => s + r.squareFeet, 0);

  const oppNotes = opportunities
    .map((o) => o.notes)
    .filter(Boolean)
    .join("\n\n");

  // Pick best contract: Signed first, then most recent non-Archived by createdAt
  const activeContracts = contracts.filter((c) => c.status !== "Archived");
  const bestContract =
    activeContracts.find((c) => c.status === "Signed") ??
    activeContracts.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ??
    null;

  const estimate = bestContract
    ? {
        status: bestContract.status,
        lineItems: (bestContract.lineItems ?? []).map((li) => ({
          serviceName: li.serviceName,
          hours: li.hours,
          rate: li.rate,
        })),
        totalCost: bestContract.totalCost,
      }
    : undefined;

  const html = buildQuoteInfoEmail({
    recipientName,
    tenantName: tenant.name,
    address: tenant.address,
    city: tenant.city,
    state: tenant.state,
    destinationSqFt: tenant.destinationSqFt,
    totalRoomSqFt: totalRoomSqFt > 0 ? totalRoomSqFt : undefined,
    opportunityNotes: oppNotes || undefined,
    estimate,
    photos: tenant.quotePhotos ?? [],
  });

  await resend.emails.send({
    from: "hello@toptiertransitions.com",
    to: recipientEmail,
    subject: `Quote Info & Photos — ${tenant.name}`,
    html,
  });

  return NextResponse.json({ ok: true });
}
