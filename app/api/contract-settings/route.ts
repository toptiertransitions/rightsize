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

  const body = await req.json();
  const settings = await upsertContractSettings(body);
  return NextResponse.json({ settings });
}
