import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { getSquareLocationName } from "@/lib/square";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId);
  if (!["TTTStaff", "TTTManager", "TTTAdmin"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const configured = !!(
    process.env.SQUARE_ACCESS_TOKEN &&
    process.env.SQUARE_LOCATION_ID &&
    process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
  );

  if (!configured) {
    return NextResponse.json({ connected: false, locationName: null });
  }

  const locationName = await getSquareLocationName();
  return NextResponse.json({ connected: !!locationName, locationName });
}
