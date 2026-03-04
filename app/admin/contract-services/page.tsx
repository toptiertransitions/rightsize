import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSystemRole, getContractSettings, getContractTemplates } from "@/lib/airtable";
import { ContractServicesClient } from "./ContractServicesClient";

export default async function ContractServicesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTAdmin") redirect("/admin");

  const [settings, templates] = await Promise.all([
    getContractSettings().catch(() => null),
    getContractTemplates().catch(() => []),
  ]);

  return <ContractServicesClient initialSettings={settings} initialTemplates={templates} />;
}
