import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, updateItem } from "@/lib/airtable";

const PAYOUT_ROLES = ["TTTStaff", "TTTManager", "TTTAdmin"];

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!sysRole || !PAYOUT_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden — TTT Staff or Manager required" }, { status: 403 });
  }

  const { itemId, payoutPaidAmount, salePrice } = await req.json();
  if (!itemId || (payoutPaidAmount == null && salePrice == null)) {
    return NextResponse.json({ error: "Missing itemId or update fields" }, { status: 400 });
  }

  const updates: Record<string, number> = {};
  if (payoutPaidAmount != null) updates.payoutPaidAmount = Number(payoutPaidAmount);
  if (salePrice != null) {
    updates.salePrice = Number(salePrice);
    updates.valueMid = Number(salePrice); // backfill Target Value
  }

  const item = await updateItem(itemId, updates as never);
  return NextResponse.json({ item });
}
