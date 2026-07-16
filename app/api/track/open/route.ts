export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { verifyTrackToken } from "@/lib/tracking";
import { getOutreachSendsForEnrollment, updateOutreachSend } from "@/lib/airtable";

// 1×1 transparent GIF
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const enrollmentId = searchParams.get("e") ?? "";
  const token = searchParams.get("t") ?? "";

  const gif = new NextResponse(GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
    },
  });

  if (!verifyTrackToken(enrollmentId, token)) return gif;

  // Fire-and-forget — don't delay the image response
  (async () => {
    try {
      const sends = await getOutreachSendsForEnrollment(enrollmentId);
      const sent = sends.find(s => s.status === "Sent");
      if (sent && !sent.openedAt) {
        await updateOutreachSend(sent.id, { openedAt: new Date().toISOString() });
      }
    } catch { /* ignore */ }
  })();

  return gif;
}
