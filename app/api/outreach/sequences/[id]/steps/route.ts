import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole, getOutreachStepsForSequence,
  createOutreachSequenceStep, updateOutreachSequenceStep, deleteOutreachSequenceStep,
} from "@/lib/airtable";

async function requireSales(userId: string) {
  const role = await getSystemRole(userId);
  return ["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "") ? role : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireSales(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const steps = await getOutreachStepsForSequence(id);
  return NextResponse.json({ steps });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireSales(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const step = await createOutreachSequenceStep({ ...body, sequenceId: id });
  return NextResponse.json({ step });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireSales(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { id, ...data } = body;
  if (!id) return NextResponse.json({ error: "Missing step id" }, { status: 400 });
  const step = await updateOutreachSequenceStep(id, data);
  return NextResponse.json({ step });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireSales(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("stepId");
  if (!id) return NextResponse.json({ error: "Missing stepId" }, { status: 400 });
  await deleteOutreachSequenceStep(id);
  return NextResponse.json({ ok: true });
}
