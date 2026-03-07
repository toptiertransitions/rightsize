import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getDripSettings, upsertDripSettings } from "@/lib/airtable";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId);
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const settings = await getDripSettings().catch(() => null);
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId);
  if (role !== "TTTAdmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const settings = await upsertDripSettings(body);
  return NextResponse.json({ settings });
}
