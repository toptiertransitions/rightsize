import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getAnyGmailToken, getGmailTokenByEmail } from "@/lib/airtable";
import { getValidAccessToken, fetchZellePayments } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (!["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const daysParam = req.nextUrl.searchParams.get("days") ?? "7";
  const days: number | "all" = daysParam === "all" ? "all" : (parseInt(daysParam) || 7);

  try {
    const zelleEmail = process.env.ZELLE_GMAIL_EMAIL;
    const token = zelleEmail
      ? await getGmailTokenByEmail(zelleEmail)
      : await getAnyGmailToken();
    if (!token) return NextResponse.json({ payments: [], connected: false, tokenError: "No token record found" });
    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(token.clerkUserId);
    } catch (e) {
      // Missing or expired refresh token — treat as not connected
      return NextResponse.json({ payments: [], connected: false, tokenError: String(e), tokenEmail: token.email });
    }
    const debug = req.nextUrl.searchParams.get("debug") === "1";
    try {
      const payments = await fetchZellePayments(accessToken, days, debug);
      return NextResponse.json({ payments, connected: true, count: payments.length });
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "DEBUG") {
        const { totalFound, snippet, plainTextPreview, mimeType } = e as Error & Record<string, unknown>;
        return NextResponse.json({ debug: true, connectedEmail: token.email, totalFound, mimeType, snippet, plainTextPreview });
      }
      throw e;
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
