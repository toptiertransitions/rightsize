import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { buildQBOAuthUrl } from "@/lib/qbo";
import { randomBytes } from "crypto";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTAdmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Generate a random CSRF state token, stored in a short-lived cookie
  const state = randomBytes(16).toString("hex");
  const url = buildQBOAuthUrl(state);

  const res = NextResponse.json({ url });
  res.cookies.set("qbo_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes — enough time to complete OAuth
    path: "/",
  });
  return res;
}
