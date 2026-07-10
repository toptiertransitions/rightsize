import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getShopperByEmail, createShopper } from "@/lib/airtable";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId);
  if (role !== "TTTAdmin" && role !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { rows } = await req.json() as {
    rows: { firstName: string; lastName: string; email: string }[];
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows provided" }, { status: 400 });
  }

  const created: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    const email = (row.email ?? "").toLowerCase().trim();
    if (!email || !email.includes("@")) {
      errors.push(`Invalid email: ${row.email}`);
      continue;
    }
    const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || email;
    try {
      const existing = await getShopperByEmail(email);
      if (existing) {
        skipped.push(`${name} (${email})`);
      } else {
        await createShopper({ name, email, source: "Manual" });
        created.push(`${name} (${email})`);
      }
    } catch (e) {
      errors.push(`${email}: ${String(e)}`);
    }
  }

  return NextResponse.json({ created, skipped, errors });
}
