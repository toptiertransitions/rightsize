import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPartnerContact } from "@/lib/partner";
import { getPartnerPointsByCompany } from "@/lib/airtable";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contact = await getPartnerContact(userId);
  if (!contact) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  const points = contact.referralCompanyId
    ? await getPartnerPointsByCompany(contact.referralCompanyId).catch(() => [])
    : [];

  const earned = points.length;
  const redeemed = points.filter((p) => p.redeemedAt).length;
  const available = earned - redeemed;

  return NextResponse.json({
    contact,
    points: { earned, redeemed, available },
  });
}
