import { NextRequest, NextResponse } from "next/server";
import { apiError, handleRouteError, requireCommunityAccess } from "@/lib/communities/access";
import { createCommunitySchema, fieldErrors } from "@/lib/communities/schema";
import { createCommunity, listCommunities } from "@/lib/communities/service";

// Communities (Ops > Community). GET: every community with its contacts
// (archived ones flagged; the list filters in the browser). POST: create.
export async function GET() {
  const actor = await requireCommunityAccess("view");
  if (actor instanceof NextResponse) return actor;
  try {
    return NextResponse.json({ communities: await listCommunities(), canEdit: actor.canEdit, canArchive: actor.canArchive });
  } catch (e) {
    return handleRouteError(e, "list");
  }
}

export async function POST(req: NextRequest) {
  const actor = await requireCommunityAccess("edit");
  if (actor instanceof NextResponse) return actor;
  const parsed = createCommunitySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Check the highlighted fields.", fieldErrors(parsed.error));
  try {
    return NextResponse.json({ community: await createCommunity(parsed.data, actor.name) }, { status: 201 });
  } catch (e) {
    return handleRouteError(e, "create");
  }
}
