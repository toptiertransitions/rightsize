import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { buildShopperBlastEmail } from "@/lib/email-blast";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId);
  if (role !== "TTTAdmin" && role !== "TTTManager") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { subject, bodyText, featuredEstates = [], featuredItems = [] } = await req.json();

  const html = buildShopperBlastEmail({
    shopperName: "Preview Recipient",
    subject: subject || "(No subject)",
    bodyText: bodyText || "(No body)",
    featuredEstates,
    featuredItems,
    unsubscribeUrl: "#",
  });

  return NextResponse.json({ html });
}
