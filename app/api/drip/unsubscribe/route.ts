import { NextRequest, NextResponse } from "next/server";
import { updateDripEnrollment } from "@/lib/airtable";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return new NextResponse("Invalid unsubscribe link.", { status: 400, headers: { "Content-Type": "text/html" } });
  }
  try {
    await updateDripEnrollment(id, { status: "Unsubscribed" });
  } catch {
    // Silently succeed to avoid revealing enrollment info
  }
  return new NextResponse(
    `<!DOCTYPE html><html><head><title>Unsubscribed</title>
    <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb;}
    .card{background:#fff;padding:48px;border-radius:16px;text-align:center;max-width:420px;box-shadow:0 4px 24px rgba(0,0,0,.08);}
    h1{color:#111;font-size:24px;margin:0 0 12px;}p{color:#6b7280;font-size:15px;line-height:1.6;margin:0;}</style>
    </head><body><div class="card">
    <h1>You've been unsubscribed.</h1>
    <p>You won't receive any more emails from this campaign. If this was a mistake, please contact us directly.</p>
    </div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}
