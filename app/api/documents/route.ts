import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserRoleForTenant, getSystemRole, getVisibleDocumentsForTenant, getReferralContactById, getReferralCompanyById } from "@/lib/airtable";

const STAFF_ROLES = ["TTTStaff", "TTTTeamLead", "TTTManager", "TTTAdmin"];

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !STAFF_ROLES.includes(sysRole)) {
    const role = await getUserRoleForTenant(userId, tenantId);
    if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const docs = await getVisibleDocumentsForTenant(tenantId).catch(() => []);

  const companyNameByPartnerId = new Map<string, string | undefined>();
  const enriched = await Promise.all(
    docs.map(async (doc) => {
      if (!companyNameByPartnerId.has(doc.partnerContactId)) {
        const contact = await getReferralContactById(doc.partnerContactId).catch(() => null);
        const company = contact?.referralCompanyId
          ? await getReferralCompanyById(contact.referralCompanyId).catch(() => null)
          : null;
        companyNameByPartnerId.set(doc.partnerContactId, company?.name);
      }
      return { ...doc, partnerCompanyName: companyNameByPartnerId.get(doc.partnerContactId) };
    })
  );

  return NextResponse.json({ documents: enriched });
}
