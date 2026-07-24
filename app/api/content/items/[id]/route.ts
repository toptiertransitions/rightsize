import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { updateContentItem, deleteContentItem } from "@/lib/airtable-content";
import type { ContentItemType, ContentAudience, ContentPipelineStage, ContentStatus } from "@/lib/types";

interface Context { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Context) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const item = await updateContentItem(id, {
    title: body.title,
    description: body.description,
    contentType: body.contentType as ContentItemType | undefined,
    fileUrl: body.fileUrl,
    filePublicId: body.filePublicId,
    linkUrl: body.linkUrl,
    thumbnailUrl: body.thumbnailUrl,
    thumbnailPublicId: body.thumbnailPublicId,
    audience: body.audience as ContentAudience | undefined,
    pipelineStage: body.pipelineStage as ContentPipelineStage | undefined,
    categoryId: body.categoryId,
    tags: body.tags,
    status: body.status as ContentStatus | undefined,
    scheduledDate: body.scheduledDate,
    sharedWith: Array.isArray(body.sharedWith) ? body.sharedWith : undefined,
  });
  return NextResponse.json({ item });
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden — TTTAdmin only" }, { status: 403 });
  }

  const { id } = await params;
  await deleteContentItem(id);
  return NextResponse.json({ success: true });
}
