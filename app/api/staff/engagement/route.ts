import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { getStaffEngagement } from "@/lib/staff-engagement/data";

// Staff Goals > Hours vs Target: weekly hours, targets and retention risk
// for every active staffer. Managers and Admins, same as the Goals tab.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId);
  if (role !== "TTTManager" && role !== "TTTAdmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    return NextResponse.json(await getStaffEngagement());
  } catch (e) {
    console.error("[staff/engagement]", e);
    return NextResponse.json({ error: "Couldn't load staff hours" }, { status: 500 });
  }
}
