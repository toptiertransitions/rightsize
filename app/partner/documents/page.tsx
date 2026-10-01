import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getPartnerContact, getPartnerProjectsByStage } from "@/lib/partner";
import { getTenantById, getPartnerTenantIdsByCompany } from "@/lib/airtable";
import { DocumentsClient } from "./DocumentsClient";

export const metadata = { title: "Documents — Partner Portal" };

export default async function PartnerDocumentsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const contact = await getPartnerContact(userId);
  if (!contact) redirect("/home");

  const projectsByStage = await getPartnerProjectsByStage(contact).catch(() => [] as { tenantId: string | null; stage: string }[]);
  const crmTenantIds = projectsByStage
    .filter((p) => p.tenantId !== null && p.stage !== "Lost" && p.stage !== "Lead" && p.stage !== "Qualifying")
    .map((p) => p.tenantId as string);

  const backfillTenantIds = contact.referralCompanyId
    ? await getPartnerTenantIdsByCompany(contact.referralCompanyId).catch(() => [] as string[])
    : [];

  const allTenantIds = Array.from(new Set([...crmTenantIds, ...backfillTenantIds]));
  const allTenants = (await Promise.all(allTenantIds.map((id) => getTenantById(id).catch(() => null)))).filter(Boolean);

  const projects = allTenants
    .filter((t) => !t!.isArchived)
    .map((t) => ({ tenantId: t!.id, name: t!.name }));

  return <DocumentsClient projects={projects} />;
}
