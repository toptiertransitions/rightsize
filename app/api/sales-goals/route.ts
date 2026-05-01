import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getSalesGoals, upsertSalesGoal } from "@/lib/airtable";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId).catch(() => null);
  if (role !== "TTTAdmin" && role !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const goals = await getSalesGoals();
  return NextResponse.json({ goals });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId).catch(() => null);
  if (role !== "TTTAdmin" && role !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const { monthKey, signedGoal, billedGoal } = body as {
    monthKey: string;
    signedGoal: number;
    billedGoal: number;
  };
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
    return NextResponse.json({ error: "Invalid monthKey" }, { status: 400 });
  }
  const goal = await upsertSalesGoal(monthKey, signedGoal ?? 0, billedGoal ?? 0);
  return NextResponse.json({ goal });
}
