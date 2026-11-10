import { getSystemRole } from "@/lib/airtable";
import { isTTTAdmin } from "@/lib/config";
import type { Tenant } from "@/lib/types";

// NonTTTClient users never get "ProFoundFinds Consignment" from the AI or
// the routing rules; consignment-worthy items go to "Other Consignment".
// NonTTTClient is derived (no stored role): no TTT system role, not an env
// admin, and the project isn't a TTT project. Staff viewing the same
// project are unaffected.
export const NON_TTT_CONSIGNMENT_ROUTE = "Other Consignment";

export async function isNonTTTClientViewer(userId: string, tenant: Pick<Tenant, "isTTT"> | null): Promise<boolean> {
  if (!tenant || tenant.isTTT === true || isTTTAdmin(userId)) return false;
  const sysRole = await getSystemRole(userId).catch(() => null);
  return !sysRole;
}

export function withoutProFoundFinds<T extends string | null | undefined>(route: T): T | typeof NON_TTT_CONSIGNMENT_ROUTE {
  return route === "ProFoundFinds Consignment" ? NON_TTT_CONSIGNMENT_ROUTE : route;
}
