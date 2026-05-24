import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPartnerContact } from "@/lib/partner";
import { getPartnerTenantIdsByCompany, getTenantById } from "@/lib/airtable";
import type { PartnerProject } from "@/lib/types";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contact = await getPartnerContact(userId);
  if (!contact) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  const tenantIds = contact.referralCompanyId
    ? await getPartnerTenantIdsByCompany(contact.referralCompanyId).catch(() => [] as string[])
    : [];

  const tenants = await Promise.all(tenantIds.map((id) => getTenantById(id).catch(() => null)));

  const projects: PartnerProject[] = tenants
    .filter(Boolean)
    .map((t) => ({
      tenantId: t!.id,
      name: t!.name,
      address: t!.address,
      city: t!.city,
      state: t!.state,
      status: t!.isArchived ? "previous" : "active",
    }));

  return NextResponse.json({ projects });
}
