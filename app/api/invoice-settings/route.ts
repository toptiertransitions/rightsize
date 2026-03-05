import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isTTTAdmin } from "@/lib/config";
import { getInvoiceSettings, upsertInvoiceSettings } from "@/lib/airtable";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isTTTAdmin(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const settings = await getInvoiceSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isTTTAdmin(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const settings = await upsertInvoiceSettings(body);
  return NextResponse.json({ settings });
}
