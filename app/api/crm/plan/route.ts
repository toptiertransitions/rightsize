import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { getQuarterlyPlanData } from "@/lib/crm-plan";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sysRole = await getSystemRole(userId);
    if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const quarterId = req.nextUrl.searchParams.get("quarterId");
    if (!quarterId) return NextResponse.json({ error: "quarterId required" }, { status: 400 });

    const data = await getQuarterlyPlanData(quarterId);
    if (!data) return NextResponse.json({ error: "Quarter not found" }, { status: 404 });

    return NextResponse.json(data);
  } catch (err) {
    console.error("[plan/route] unhandled error:", err);
    return NextResponse.json({ error: String(err), reps: [], quarter: null }, { status: 500 });
  }
}
