export const runtime = "nodejs";

import { NextRequest, NextResponse, after } from "next/server";
import { verifyTrackToken } from "@/lib/tracking";
import { getOutreachSendsForEnrollment, updateOutreachSend } from "@/lib/airtable";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const enrollmentId = searchParams.get("e") ?? "";
  const token = searchParams.get("t") ?? "";
  const targetUrl = searchParams.get("url") ?? "";

  // Always redirect first — tracking is best-effort
  const destination = targetUrl || "/";

  if (verifyTrackToken(enrollmentId, token) && targetUrl) {
    after(async () => {
      try {
        const sends = await getOutreachSendsForEnrollment(enrollmentId);
        const sent = sends.find(s => s.status === "Sent");
        if (sent && !sent.clickedAt) {
          await updateOutreachSend(sent.id, {
            clickedAt: new Date().toISOString(),
            clickedUrl: targetUrl,
          });
        }
      } catch (err) {
        console.error("[track/click] failed:", err);
      }
    });
  }

  return NextResponse.redirect(destination, { status: 302 });
}
