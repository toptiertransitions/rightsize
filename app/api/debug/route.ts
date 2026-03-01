import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getMembershipsForUser } from "@/lib/airtable";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let memberships: unknown = null;
  let airtableError: string | null = null;
  try {
    memberships = await getMembershipsForUser(userId);
  } catch (e) {
    airtableError = String(e);
  }

  return NextResponse.json({ userId, memberships, airtableError });
}
