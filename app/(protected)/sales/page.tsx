import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  getItemsForTenant,
  getUserRoleForTenant,
  getTenantById,
  getVendorsForTenant,
  getProjectFiles,
  getSystemRole,
  getMembershipsForUser,
  getRoomsForTenant,
  getAllLocalVendors,
  getItemSaleEventsForTenant,
  getTenants,
  getInvoiceSettings,
} from "@/lib/airtable";
import { SalesClient } from "./SalesClient";
import type { PrimaryRoute } from "@/lib/types";

const EDIT_ROLES = ["Owner", "Collaborator", "TTTStaff", "TTTAdmin"];

interface PageProps {
  searchParams: Promise<{ tenantId?: string }>;
}

const CONSIGNMENT_ROUTES: PrimaryRoute[] = [
  "ProFoundFinds Consignment",
  "FB/Marketplace",
  "Online Marketplace",
  "Other Consignment",
];

export default async function SalesPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  let { tenantId } = await searchParams;

  // If no tenantId, redirect to the user's single project or home
  if (!tenantId) {
    const memberships = await getMembershipsForUser(userId).catch(() => []);
    if (memberships.length === 1) redirect(`/sales?tenantId=${memberships[0].tenantId}`);
    if (memberships.length === 0) redirect("/home");
    redirect("/home");
  }

  const [tenant, role, allItems, vendors, files, sysRole, rooms, localVendors, pfSaleEvents, allTenants, invoiceSettings] = await Promise.all([
    getTenantById(tenantId).catch(() => null),
    getUserRoleForTenant(userId, tenantId).catch(() => null),
    getItemsForTenant(tenantId).catch(() => []),
    getVendorsForTenant(tenantId).catch(() => []),
    getProjectFiles(tenantId).catch(() => []),
    getSystemRole(userId).catch(() => null),
    getRoomsForTenant(tenantId).catch(() => []),
    getAllLocalVendors().catch(() => []),
    getItemSaleEventsForTenant(tenantId).catch(() => []),
    getTenants().catch(() => []),
    getInvoiceSettings().catch(() => null),
  ]);

  if (!tenant) redirect("/home");
  const resolvedRole = role ?? sysRole;
  if (!resolvedRole) redirect("/home");

  // Fetch owner email for pre-filling the payout email field
  let ownerEmail = "";
  if (tenant.ownerUserId) {
    const clerk = await clerkClient();
    const ownerUser = await clerk.users.getUser(tenant.ownerUserId).catch(() => null);
    ownerEmail = ownerUser?.emailAddresses?.[0]?.emailAddress ?? "";
  }

  const items = allItems.filter(i => CONSIGNMENT_ROUTES.includes(i.primaryRoute));
  const paymentProofFiles = files.filter(f => f.fileTag === "Payment Proof");

  const canEdit = EDIT_ROLES.includes(resolvedRole);
  const canEditPayout = sysRole === "TTTStaff" || sysRole === "TTTManager" || sysRole === "TTTAdmin";
  const canPayoutClient = sysRole === "TTTManager" || sysRole === "TTTAdmin";
  const canDeleteProof = sysRole === "TTTManager" || sysRole === "TTTAdmin";
  const canReassign = sysRole === "TTTManager" || sysRole === "TTTAdmin";
  const isStaff = sysRole === "TTTStaff" || sysRole === "TTTManager" || sysRole === "TTTAdmin" || sysRole === "TTTSales";
  const paymentHandles = isStaff && invoiceSettings ? {
    venmoHandle: invoiceSettings.venmoHandle,
    venmoQrUrl: invoiceSettings.venmoQrUrl,
    zelleHandle: invoiceSettings.zelleHandle,
    zelleQrUrl: invoiceSettings.zelleQrUrl,
  } : undefined;

  return (
    <SalesClient
      tenantId={tenantId}
      tenantName={tenant.name}
      items={items}
      vendors={vendors}
      rooms={rooms}
      localVendors={localVendors}
      paymentProofFiles={paymentProofFiles}
      pfSaleEvents={pfSaleEvents}
      ownerEmail={ownerEmail}
      canEdit={canEdit}
      canEditPayout={canEditPayout}
      canPayoutClient={canPayoutClient}
      canDeleteProof={canDeleteProof}
      canReassign={canReassign}
      allTenants={canReassign ? allTenants : undefined}
      paymentHandles={paymentHandles}
    />
  );
}
