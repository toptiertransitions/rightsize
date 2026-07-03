import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getReferralContactById, getPartnerPointsByCompany, getPartnerPoints } from "@/lib/airtable";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const referralContactId = req.nextUrl.searchParams.get("referralContactId");
  if (!referralContactId) return NextResponse.json({ error: "Missing referralContactId" }, { status: 400 });

  const contact = await getReferralContactById(referralContactId).catch(() => null);
  if (!contact) return NextResponse.json({ earned: 0, redeemed: 0, balance: 0, earnedYTD: 0 });

  const companyId = contact.referralCompanyId || null;
  const points = await (companyId
    ? getPartnerPointsByCompany(companyId).catch(() => [])
    : getPartnerPoints(contact.id).catch(() => [])
  );

  const currentYear = new Date().getFullYear();
  const earned    = points.length;
  const redeemed  = points.filter(p => p.redeemedAt).length;
  const balance   = earned - redeemed;
  const earnedYTD = points.filter(p => new Date(p.earnedAt).getFullYear() === currentYear).length;

  return NextResponse.json({ earned, redeemed, balance, earnedYTD });
}
