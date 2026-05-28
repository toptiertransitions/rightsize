import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getReviewsForTenant, createGoogleReview } from "@/lib/airtable";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const reviews = await getReviewsForTenant(id).catch(() => []);
  return NextResponse.json({ reviews });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!["TTTManager", "TTTAdmin"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: { stars: number; text: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const stars = Number(body.stars);
  if (!stars || stars < 1 || stars > 5 || !body.text?.trim()) {
    return NextResponse.json({ error: "stars (1–5) and text are required" }, { status: 400 });
  }

  try {
    const review = await createGoogleReview(id, stars, body.text.trim());
    return NextResponse.json({ review }, { status: 201 });
  } catch (e) {
    console.error("[reviews POST] Airtable error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
