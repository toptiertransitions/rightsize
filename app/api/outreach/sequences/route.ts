import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole, getAllOutreachSequences,
  createOutreachSequence, getOutreachSequences,
} from "@/lib/airtable";

async function requireSales(userId: string) {
  const role = await getSystemRole(userId);
  return ["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "") ? role : null;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireSales(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const all = req.nextUrl.searchParams.get("all") === "1";
  const sequences = all ? await getAllOutreachSequences() : await getOutreachSequences(userId);
  // Exclude broadcasts (isBroadcast flag)
  const filtered = sequences.filter(s => {
    try { return !JSON.parse(s.triggerConfigJson || "{}").isBroadcast; } catch { return true; }
  });
  return NextResponse.json({ sequences: filtered });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireSales(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, description, autoPauseOnReply, sendWindowJson } = body;
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const sequence = await createOutreachSequence({
    name,
    description: description ?? "",
    status: "Draft",
    ownerClerkId: userId,
    triggerType: "Manual",
    triggerConfigJson: "{}",
    defaultAudienceId: "",
    sendWindowJson: sendWindowJson ?? "",
    autoPauseOnReply: autoPauseOnReply ?? true,
  });
  return NextResponse.json({ sequence });
}
