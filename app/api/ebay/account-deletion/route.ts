import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

// eBay Marketplace Account Deletion notification endpoint.
// GET: eBay sends a challenge_code to verify the endpoint is live.
// POST: eBay sends account deletion events (no action needed — we store no eBay buyer PII).

export async function GET(req: NextRequest) {
  const challengeCode = req.nextUrl.searchParams.get("challenge_code");
  if (!challengeCode) {
    return NextResponse.json({ error: "missing challenge_code" }, { status: 400 });
  }

  const verificationToken = process.env.EBAY_DELETION_TOKEN;
  if (!verificationToken) {
    return NextResponse.json({ error: "EBAY_DELETION_TOKEN not configured" }, { status: 500 });
  }

  // Derive endpoint URL from the request itself so it exactly matches what eBay is calling
  const endpointUrl = req.url.split("?")[0];

  const hash = createHash("sha256");
  hash.update(challengeCode);
  hash.update(verificationToken);
  hash.update(endpointUrl);
  const challengeResponse = hash.digest("hex");

  return NextResponse.json({ challengeResponse });
}

export async function POST() {
  // We hold no eBay buyer PII, so no deletion action required.
  return new NextResponse(null, { status: 200 });
}
