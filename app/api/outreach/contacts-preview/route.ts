import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, resolveOutreachContacts } from "@/lib/airtable";
import type { OutreachContactFilter } from "@/lib/airtable";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const filter: OutreachContactFilter = await req.json();
  const contacts = await resolveOutreachContacts(filter);
  return NextResponse.json({ count: contacts.length, sample: contacts.slice(0, 5).map(c => c.name) });
}
