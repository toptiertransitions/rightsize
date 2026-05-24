import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPartnerContact } from "@/lib/partner";
import { getPartnerPoints, getPartnerPointsByCompany, getSystemRole } from "@/lib/airtable";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // TTTManager/TTTAdmin can query a specific contact via ?contactId= or company via ?companyId=
  const contactIdParam = req.nextUrl.searchParams.get("contactId");
  const companyIdParam = req.nextUrl.searchParams.get("companyId");
  if (contactIdParam || companyIdParam) {
    const sysRole = await getSystemRole(userId).catch(() => null);
    if (!["TTTManager", "TTTAdmin"].includes(sysRole ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const points = companyIdParam
      ? await getPartnerPointsByCompany(companyIdParam).catch(() => [])
      : await getPartnerPoints(contactIdParam!).catch(() => []);
    return NextResponse.json({ points });
  }

  // Self-service: return company-wide points
  const contact = await getPartnerContact(userId);
  if (!contact) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  const points = contact.referralCompanyId
    ? await getPartnerPointsByCompany(contact.referralCompanyId).catch(() => [])
    : [];

  return NextResponse.json({ points });
}
