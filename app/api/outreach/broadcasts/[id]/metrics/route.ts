export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getOutreachSendsForSequence } from "@/lib/airtable";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const rows = await getOutreachSendsForSequence(id);

  const recipients = rows.map(({ enrollment: e, send: s }) => ({
    contactName: e.contactName,
    contactEmail: e.contactEmail,
    status: s?.status ?? "Pending",
    errorMessage: s?.errorMessage ?? "",
    openedAt: s?.openedAt ?? null,
    clickedAt: s?.clickedAt ?? null,
    clickedUrl: s?.clickedUrl ?? null,
  }));

  const sent = recipients.filter(r => r.status === "Sent").length;
  const failed = recipients.filter(r => r.status === "Failed").length;
  const opened = recipients.filter(r => r.openedAt).length;
  const clicked = recipients.filter(r => r.clickedAt).length;

  return NextResponse.json({
    recipients,
    stats: { sent, failed, opened, clicked, total: recipients.length },
  });
}
