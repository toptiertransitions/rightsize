import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { getGmailAuthUrl } from "@/lib/gmail";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTManager" && sysRole !== "TTTAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = getGmailAuthUrl(userId);
  return NextResponse.redirect(url);
}
