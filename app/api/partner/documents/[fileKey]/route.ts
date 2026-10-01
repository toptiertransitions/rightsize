import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPartnerContact } from "@/lib/partner";
import { getDocumentByFileKey, updateDocumentStatus, createDocumentActivityLogEntry } from "@/lib/airtable";
import { deleteAuthenticatedFile } from "@/lib/cloudinary";
import { shouldAlertOnRepeatedDenials } from "@/lib/documents";
import { sendDocumentAbuseAlert } from "@/lib/admin-notifications";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ fileKey: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contact = await getPartnerContact(userId);
  if (!contact) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  const { fileKey } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;

  const doc = await getDocumentByFileKey(fileKey).catch(() => null);
  if (!doc || doc.status === "Deleted") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Ownership check: a partner may only delete their own uploads, never
  // another partner's — even if they somehow learned the fileKey.
  if (doc.partnerContactId !== contact.id) {
    await createDocumentActivityLogEntry({
      fileKey,
      action: "Denied",
      actorUserId: userId,
      actorRole: "Partner",
      ipAddress: ip,
      detail: "Attempted delete of a document not owned by this partner",
    }).catch(() => {});
    if (await shouldAlertOnRepeatedDenials(userId).catch(() => false)) {
      await sendDocumentAbuseAlert({ actorUserId: userId, reason: "Repeated denied access attempts (latest: delete of a document not owned by this partner)" }).catch(() => {});
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await deleteAuthenticatedFile(doc.cloudinaryPublicId).catch(() => {});
    await updateDocumentStatus(fileKey, "Deleted");
    await createDocumentActivityLogEntry({
      fileKey,
      action: "Delete",
      actorUserId: userId,
      actorRole: "Partner",
      ipAddress: ip,
      detail: doc.originalFileName,
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
