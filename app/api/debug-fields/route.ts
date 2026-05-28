import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const baseId = process.env.AIRTABLE_BASE_ID!;
  const token = process.env.AIRTABLE_API_TOKEN!;

  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();

  const table = (data.tables as { name: string; fields: { name: string; type: string }[] }[])
    ?.find((t) => t.name === "GoogleReviews");

  return NextResponse.json({
    found: !!table,
    fields: table?.fields?.map((f) => ({ name: f.name, type: f.type })) ?? [],
    allTableNames: (data.tables as { name: string }[])?.map((t) => t.name) ?? [],
  });
}
