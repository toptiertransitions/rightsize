import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSystemRole, getRoutingRules, getAllLocalVendors } from "@/lib/airtable";
import { RoutingRulesClient } from "./RoutingRulesClient";

export default async function RoutingRulesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTAdmin") redirect("/home");

  const [rules, vendors] = await Promise.all([
    getRoutingRules().catch(() => []),
    getAllLocalVendors().catch(() => []),
  ]);

  return <RoutingRulesClient initialRules={rules} vendors={vendors} />;
}
