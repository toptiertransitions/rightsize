import { NextRequest, NextResponse } from "next/server";
import { RECORD_ID, apiError, handleRouteError, requireCommunityAccess } from "@/lib/communities/access";
import { createContactSchema, fieldErrors } from "@/lib/communities/schema";
import { createContact, listContacts } from "@/lib/communities/service";
import { getRecord, COMMUNITY_TABLES } from "@/lib/communities/airtable";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const actor = await requireCommunityAccess("view");
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  if (!RECORD_ID.test(id)) return apiError(404, "Community not found.");
  try {
    return NextResponse.json({ contacts: await listContacts(id) });
  } catch (e) {
    return handleRouteError(e, "list contacts");
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const actor = await requireCommunityAccess("edit");
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  if (!RECORD_ID.test(id)) return apiError(404, "Community not found.");
  const parsed = createContactSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Check the highlighted fields.", fieldErrors(parsed.error));
  try {
    if (!(await getRecord(COMMUNITY_TABLES.COMMUNITIES, id))) return apiError(404, "Community not found.");
    return NextResponse.json({ contact: await createContact(id, parsed.data, actor.name) }, { status: 201 });
  } catch (e) {
    return handleRouteError(e, "create contact");
  }
}
