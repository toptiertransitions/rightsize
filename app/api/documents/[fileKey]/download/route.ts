import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserRoleForTenant, getSystemRole, getDocumentByFileKey, createDocumentActivityLogEntry } from "@/lib/airtable";
import { getAuthenticatedDownloadUrl } from "@/lib/cloudinary";
import { extensionForMimeType, shouldAlertOnRepeatedDenials } from "@/lib/documents";
import { sendDocumentAbuseAlert } from "@/lib/admin-notifications";

export const runtime = "nodejs";

const STAFF_ROLES = ["TTTStaff", "TTTTeamLead", "TTTManager", "TTTAdmin"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ fileKey: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { fileKey } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;

  const doc = await getDocumentByFileKey(fileKey).catch(() => null);
  if (!doc || doc.status !== "Clean") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Re-checked on this exact request — never cached, never trusted from a
  // prior page load.
  const sysRole = await getSystemRole(userId).catch(() => null);
  const isStaff = !!sysRole && STAFF_ROLES.includes(sysRole);
  if (!isStaff) {
    const role = await getUserRoleForTenant(userId, doc.tenantId).catch(() => null);
    if (!role) {
      await createDocumentActivityLogEntry({
        fileKey,
        action: "Denied",
        actorUserId: userId,
        actorRole: "Client",
        ipAddress: ip,
        detail: `No access to project ${doc.tenantId}`,
      }).catch(() => {});
      if (await shouldAlertOnRepeatedDenials(userId).catch(() => false)) {
        await sendDocumentAbuseAlert({ actorUserId: userId, reason: `Repeated denied access attempts (latest: download on project ${doc.tenantId})` }).catch(() => {});
      }
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const ext = extensionForMimeType(doc.mimeType);
    const signedUrl = getAuthenticatedDownloadUrl(doc.cloudinaryPublicId, ext, 90);
    const fileRes = await fetch(signedUrl);
    if (!fileRes.ok) {
      return NextResponse.json({ error: "File unavailable" }, { status: 502 });
    }

    await createDocumentActivityLogEntry({
      fileKey,
      action: "Download",
      actorUserId: userId,
      actorRole: isStaff ? "Staff" : "Client",
      ipAddress: ip,
      detail: doc.originalFileName,
    }).catch(() => {});

    const body = await fileRes.arrayBuffer();
    return new NextResponse(body, {
      headers: {
        "Content-Type": doc.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${doc.originalFileName.replace(/"/g, "")}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
