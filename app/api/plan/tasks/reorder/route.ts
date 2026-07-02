import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, updateProjectTask } from "@/lib/airtable";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTAdmin") {
    return NextResponse.json({ error: "Forbidden — TTTAdmin required" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const orderedIds: string[] = body?.orderedIds ?? [];
  if (!orderedIds.length) return NextResponse.json({ error: "Missing orderedIds" }, { status: 400 });

  try {
    await Promise.all(
      orderedIds.map((id, index) => updateProjectTask(id, { sortOrder: index }))
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
