import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getQBOToken } from "@/lib/airtable";
import { getValidQBOToken } from "@/lib/qbo";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTAdmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Use getValidQBOToken so an expired/revoked token is detected and cleared here
  const valid = await getValidQBOToken().catch(() => null);
  if (!valid) return NextResponse.json({ connected: false });

  // Read stored record for metadata (companyName etc.) — token is fresh at this point
  const token = await getQBOToken().catch(() => null);
  return NextResponse.json({
    connected: true,
    companyName: token?.companyName ?? "",
    realmId: valid.realmId,
  });
}
