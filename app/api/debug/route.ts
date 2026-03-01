import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getMembershipsForUser, createPlanEntry } from "@/lib/airtable";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const tokenRaw = process.env.AIRTABLE_API_TOKEN ?? "";
  const tokenInfo = {
    length: tokenRaw.length,
    hasNewline: tokenRaw.includes("\n"),
    first10: tokenRaw.slice(0, 10),
    last10: tokenRaw.slice(-10),
  };

  let memberships: unknown = null;
  let membershipsError: string | null = null;
  try {
    memberships = await getMembershipsForUser(userId);
  } catch (e) {
    membershipsError = String(e);
  }

  let writeResult: unknown = null;
  let writeError: string | null = null;
  try {
    writeResult = await createPlanEntry({
      tenantId: "rec59sH0gNK3tQNPr",
      date: "2026-03-01",
      activity: "Sorting",
    });
  } catch (e) {
    writeError = String(e);
  }

  return NextResponse.json({ userId, tokenInfo, memberships, membershipsError, writeResult, writeError });
}
