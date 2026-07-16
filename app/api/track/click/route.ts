export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { verifyTrackToken } from "@/lib/tracking";
import { getOutreachSendsForEnrollment, updateOutreachSend } from "@/lib/airtable";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const enrollmentId = searchParams.get("e") ?? "";
  const token = searchParams.get("t") ?? "";
  const targetUrl = searchParams.get("url") ?? "";

  // Always redirect — tracking is best-effort
  const destination = targetUrl || "/";

  if (verifyTrackToken(enrollmentId, token) && targetUrl) {
    (async () => {
      try {
        const sends = await getOutreachSendsForEnrollment(enrollmentId);
        const sent = sends.find(s => s.status === "Sent");
        if (sent) {
          await updateOutreachSend(sent.id, {
            clickedAt: sent.clickedAt ?? new Date().toISOString(),
            clickedUrl: sent.clickedUrl ?? targetUrl,
          });
        }
      } catch { /* ignore */ }
    })();
  }

  return NextResponse.redirect(destination, { status: 302 });
}
