import { NextRequest, NextResponse } from "next/server";
import { RECORD_ID, apiError, handleRouteError, requireCommunityAccess } from "@/lib/communities/access";
import { fieldErrors, updateCommunitySchema } from "@/lib/communities/schema";
import { getCommunity, updateCommunity } from "@/lib/communities/service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const actor = await requireCommunityAccess("view");
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  if (!RECORD_ID.test(id)) return apiError(404, "Community not found.");
  try {
    const detail = await getCommunity(id);
    if (!detail) return apiError(404, "Community not found.");
    return NextResponse.json({ ...detail, canEdit: actor.canEdit, canArchive: actor.canArchive });
  } catch (e) {
    return handleRouteError(e, "get");
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const actor = await requireCommunityAccess("edit");
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  if (!RECORD_ID.test(id)) return apiError(404, "Community not found.");
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  // Archiving goes through /archive (Managers and Admins only)
  if (body && "archived" in body) return apiError(400, "Use Archive to archive or restore a community.");
  const parsed = updateCommunitySchema.safeParse(body);
  if (!parsed.success) return apiError(400, "Check the highlighted fields.", fieldErrors(parsed.error));
  try {
    const community = await updateCommunity(id, parsed.data, actor.name);
    if (!community) return apiError(404, "Community not found.");
    return NextResponse.json({ community });
  } catch (e) {
    return handleRouteError(e, "update");
  }
}
