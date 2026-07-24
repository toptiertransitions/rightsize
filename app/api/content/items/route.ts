export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { getContentItems, createContentItem } from "@/lib/airtable-content";
import type { ContentItemType, ContentAudience, ContentPipelineStage, ContentStatus } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const status = (searchParams.get("status") as ContentStatus | null) ?? undefined;
  const audience = (searchParams.get("audience") as ContentAudience | null) ?? undefined;
  const pipelineStage = (searchParams.get("pipelineStage") as ContentPipelineStage | null) ?? undefined;
  const categoryId = searchParams.get("categoryId") ?? undefined;
  const scheduledDateFrom = searchParams.get("from") ?? undefined;
  const scheduledDateTo = searchParams.get("to") ?? undefined;

  const items = await getContentItems({ status, audience, pipelineStage, categoryId, scheduledDateFrom, scheduledDateTo });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.title || !body?.contentType || !body?.audience || !body?.pipelineStage) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const item = await createContentItem({
    title: body.title,
    description: body.description,
    contentType: body.contentType as ContentItemType,
    fileUrl: body.fileUrl,
    filePublicId: body.filePublicId,
    linkUrl: body.linkUrl,
    thumbnailUrl: body.thumbnailUrl,
    thumbnailPublicId: body.thumbnailPublicId,
    audience: body.audience as ContentAudience,
    pipelineStage: body.pipelineStage as ContentPipelineStage,
    categoryId: body.categoryId,
    tags: body.tags ?? [],
    authorClerkId: userId,
    status: body.status ?? "Active",
    scheduledDate: body.scheduledDate,
  });

  return NextResponse.json({ item });
}
