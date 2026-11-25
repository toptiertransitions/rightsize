import { NextRequest, NextResponse } from "next/server";
import { RECORD_ID, apiError, handleRouteError, requireCommunityAccess } from "@/lib/communities/access";
import { setCommunityArchived } from "@/lib/communities/service";

// POST { archived: true | false }. Managers and Admins only. Nothing is
// ever hard-deleted.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCommunityAccess("archive");
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  if (!RECORD_ID.test(id)) return apiError(404, "Community not found.");
  const body = await req.json().catch(() => null) as { archived?: unknown } | null;
  if (typeof body?.archived !== "boolean") return apiError(400, "Say whether to archive or restore.");
  try {
    const community = await setCommunityArchived(id, body.archived, actor.name);
    if (!community) return apiError(404, "Community not found.");
    return NextResponse.json({ community });
  } catch (e) {
    return handleRouteError(e, "archive");
  }
}
