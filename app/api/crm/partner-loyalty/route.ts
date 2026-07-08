import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getReferralContactById } from "@/lib/airtable";
import { getLoyaltyRecord } from "@/lib/airtable-loyalty";

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
  const loyaltyKey = companyId || contact.clerkUserId || contact.id;

  const record = await getLoyaltyRecord(loyaltyKey).catch(() => null);
  if (!record) return NextResponse.json({ earned: 0, redeemed: 0, balance: 0, earnedYTD: 0 });

  return NextResponse.json({
    earned: record.lifetimePoints,
    redeemed: 0,
    balance: record.lifetimePoints,
    earnedYTD: record.currentYearPoints,
  });
}
