import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPartnerContact } from "@/lib/partner";
import { getPartnerTenantIdsByCompany, getReviewsForTenant } from "@/lib/airtable";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contact = await getPartnerContact(userId);
  if (!contact) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  const tenantIds = contact.referralCompanyId
    ? await getPartnerTenantIdsByCompany(contact.referralCompanyId).catch(() => [] as string[])
    : [];

  const reviewArrays = await Promise.all(
    tenantIds.map((id) => getReviewsForTenant(id).catch(() => []))
  );
  const reviews = reviewArrays.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({ reviews });
}
