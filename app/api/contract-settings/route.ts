import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getContractSettings, upsertContractSettings, getSystemRole } from "@/lib/airtable";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await getContractSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTAdmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { rightsizingRate, packingRate, unpackingRate } = await req.json();
  if (typeof rightsizingRate !== "number" || typeof packingRate !== "number" || typeof unpackingRate !== "number") {
    return NextResponse.json({ error: "Invalid rates" }, { status: 400 });
  }

  const settings = await upsertContractSettings({ rightsizingRate, packingRate, unpackingRate });
  return NextResponse.json({ settings });
}
