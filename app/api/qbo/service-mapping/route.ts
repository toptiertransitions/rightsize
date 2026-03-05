import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, updateService } from "@/lib/airtable";

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTAdmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { serviceId, qboItemId } = await req.json();
  if (!serviceId) return NextResponse.json({ error: "Missing serviceId" }, { status: 400 });

  const updated = await updateService(serviceId, { qboItemId: qboItemId || "" });
  return NextResponse.json({ service: updated });
}
