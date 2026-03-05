import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSystemRole, getContractSettings, getContractTemplates, getAllServices } from "@/lib/airtable";
import { ContractServicesClient } from "./ContractServicesClient";

export default async function ContractServicesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTAdmin") redirect("/admin");

  const [settings, templates, services] = await Promise.all([
    getContractSettings().catch(() => null),
    getContractTemplates().catch(() => []),
    getAllServices().catch(() => []),
  ]);

  return <ContractServicesClient initialSettings={settings} initialTemplates={templates} initialServices={services} />;
}
