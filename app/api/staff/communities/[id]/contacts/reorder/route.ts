import { NextRequest, NextResponse } from "next/server";
import { RECORD_ID, apiError, handleRouteError, requireCommunityAccess } from "@/lib/communities/access";
import { fieldErrors, reorderContactsSchema } from "@/lib/communities/schema";
import { reorderContacts } from "@/lib/communities/service";

// POST { order: [contactId, ...] }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCommunityAccess("edit");
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  if (!RECORD_ID.test(id)) return apiError(404, "Community not found.");
  const parsed = reorderContactsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Send the contact order.", fieldErrors(parsed.error));
  try {
    return NextResponse.json({ contacts: await reorderContacts(id, parsed.data.order, actor.name) });
  } catch (e) {
    return handleRouteError(e, "reorder contacts");
  }
}
