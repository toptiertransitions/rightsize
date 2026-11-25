import { NextRequest, NextResponse } from "next/server";
import { RECORD_ID, apiError, handleRouteError, requireCommunityAccess } from "@/lib/communities/access";
import { fieldErrors, updateContactSchema } from "@/lib/communities/schema";
import { removeContact, updateContact } from "@/lib/communities/service";

type Ctx = { params: Promise<{ id: string; contactId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const actor = await requireCommunityAccess("edit");
  if (actor instanceof NextResponse) return actor;
  const { id, contactId } = await params;
  if (!RECORD_ID.test(id) || !RECORD_ID.test(contactId)) return apiError(404, "Contact not found.");
  const parsed = updateContactSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Check the highlighted fields.", fieldErrors(parsed.error));
  try {
    const contact = await updateContact(id, contactId, parsed.data, actor.name);
    if (!contact) return apiError(404, "Contact not found.");
    return NextResponse.json({ contact });
  } catch (e) {
    return handleRouteError(e, "update contact");
  }
}

/** Remove = archive the contact. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const actor = await requireCommunityAccess("edit");
  if (actor instanceof NextResponse) return actor;
  const { id, contactId } = await params;
  if (!RECORD_ID.test(id) || !RECORD_ID.test(contactId)) return apiError(404, "Contact not found.");
  try {
    if (!(await removeContact(id, contactId, actor.name))) return apiError(404, "Contact not found.");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleRouteError(e, "remove contact");
  }
}
