import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  if (secret !== process.env.STOREFRONT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    console.log("[storefront/webhook/item-updated] Received ping:", JSON.stringify(body));
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ received: true });
  }
}
