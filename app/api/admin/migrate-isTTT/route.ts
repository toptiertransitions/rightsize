import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getTenants, updateTenant } from "@/lib/airtable";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTAdmin") {
    return NextResponse.json({ error: "Forbidden — TTTAdmin only" }, { status: 403 });
  }

  const all = await getTenants().catch(() => []);
  // Set all existing tenants to isTTT = true
  await Promise.all(all.map(t => updateTenant(t.id, { isTTT: true }).catch(() => null)));

  return NextResponse.json({ updated: all.length });
}
