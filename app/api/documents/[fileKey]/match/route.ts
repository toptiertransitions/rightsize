import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getUserRoleForTenant,
  getSystemRole,
  getDocumentByFileKey,
  getPartnerSelectionsForTenant,
  updateDocumentMatch,
  createDocumentActivityLogEntry,
} from "@/lib/airtable";
import { shouldAlertOnRepeatedDenials } from "@/lib/documents";
import { sendDocumentAbuseAlert } from "@/lib/admin-notifications";

const STAFF_ROLES = ["TTTStaff", "TTTTeamLead", "TTTManager", "TTTAdmin"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ fileKey: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { fileKey } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;

  let body: { matchedVendorId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const matchedVendorId = body.matchedVendorId ?? null;

  const doc = await getDocumentByFileKey(fileKey).catch(() => null);
  if (!doc || doc.status !== "Clean") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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
        detail: `Attempted match on project ${doc.tenantId} without access`,
      }).catch(() => {});
      if (await shouldAlertOnRepeatedDenials(userId).catch(() => false)) {
        await sendDocumentAbuseAlert({ actorUserId: userId, reason: `Repeated denied access attempts (latest: match on project ${doc.tenantId})` }).catch(() => {});
      }
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Only allow matching to a vendor the client has actually selected on
  // this project — never an arbitrary LocalVendors id from the client.
  if (matchedVendorId) {
    const selections = await getPartnerSelectionsForTenant(doc.tenantId).catch(() => []);
    const valid = selections.some((s) => s.partnerId === matchedVendorId);
    if (!valid) {
      return NextResponse.json({ error: "That partner isn't on this project's team." }, { status: 400 });
    }
  }

  await updateDocumentMatch(fileKey, matchedVendorId);
  return NextResponse.json({ ok: true });
}
