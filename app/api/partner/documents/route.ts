import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPartnerContact } from "@/lib/partner";
import { partnerHasAccessToTenant } from "@/lib/partner";
import {
  createDocument,
  createDocumentActivityLogEntry,
  getDocumentsByPartnerContact,
  getReferralCompanyById,
  updateDocumentStatus,
} from "@/lib/airtable";
import { uploadAuthenticatedFile } from "@/lib/cloudinary";
import {
  generateFileKey,
  sanitizeFileName,
  extensionForMimeType,
  validateUpload,
  scanWithVirusTotal,
  checkUploadRateLimit,
  shouldAlertOnRepeatedDenials,
} from "@/lib/documents";
import { sendPartnerDocumentSharedNotification, sendDocumentQuarantineAlert, sendDocumentAbuseAlert } from "@/lib/admin-notifications";

export const runtime = "nodejs";
export const maxDuration = 60;

function getClientIp(req: NextRequest): string | undefined {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contact = await getPartnerContact(userId);
  if (!contact) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  let docs = await getDocumentsByPartnerContact(contact.id).catch(() => []);
  if (tenantId) docs = docs.filter((d) => d.tenantId === tenantId);

  return NextResponse.json({ documents: docs });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contact = await getPartnerContact(userId);
  if (!contact) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const tenantId = formData.get("tenantId") as string | null;
  const note = (formData.get("note") as string | null)?.trim().slice(0, 2000) || undefined;

  if (!file || !tenantId) {
    return NextResponse.json({ error: "Missing file or tenantId" }, { status: 400 });
  }

  const ip = getClientIp(req);

  // Server-side authorization, re-checked on this exact request — never
  // trust the tenantId the client sent without verifying the referral chain.
  const hasAccess = await partnerHasAccessToTenant(contact, tenantId).catch(() => false);
  if (!hasAccess) {
    await createDocumentActivityLogEntry({
      fileKey: "n/a",
      action: "Denied",
      actorUserId: userId,
      actorRole: "Partner",
      ipAddress: ip,
      detail: `Attempted upload to unreferred project ${tenantId}`,
    }).catch(() => {});
    if (await shouldAlertOnRepeatedDenials(userId).catch(() => false)) {
      await sendDocumentAbuseAlert({ actorUserId: userId, reason: `Repeated denied access attempts (latest: upload to unreferred project ${tenantId})` }).catch(() => {});
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rateLimit = await checkUploadRateLimit(contact.id, tenantId);
  if (!rateLimit.allowed) {
    await createDocumentActivityLogEntry({
      fileKey: "n/a",
      action: "Denied",
      actorUserId: userId,
      actorRole: "Partner",
      ipAddress: ip,
      detail: `Rate limited: ${rateLimit.reason}`,
    }).catch(() => {});
    return NextResponse.json({ error: rateLimit.reason }, { status: 429 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = validateUpload(buffer, file.type, buffer.length);
  if (!validation.ok) {
    await createDocumentActivityLogEntry({
      fileKey: "n/a",
      action: "Denied",
      actorUserId: userId,
      actorRole: "Partner",
      ipAddress: ip,
      detail: `Rejected upload: ${validation.reason}`,
    }).catch(() => {});
    return NextResponse.json({ error: validation.reason }, { status: 400 });
  }

  const fileKey = generateFileKey();
  const mimeType = validation.mimeType!;
  const ext = extensionForMimeType(mimeType);
  const safeName = `${sanitizeFileName(file.name)}.${ext}`;

  try {
    await uploadAuthenticatedFile(buffer, {
      publicId: `rightsize/documents/${tenantId}/${fileKey}`,
      mimeType,
    });

    await createDocument({
      fileKey,
      originalFileName: safeName,
      partnerContactId: contact.id,
      partnerName: contact.name,
      tenantId,
      note,
      fileSize: buffer.length,
      mimeType,
      cloudinaryPublicId: `rightsize/documents/${tenantId}/${fileKey}`,
    });

    await createDocumentActivityLogEntry({
      fileKey,
      action: "Upload",
      actorUserId: userId,
      actorRole: "Partner",
      ipAddress: ip,
      detail: safeName,
    }).catch(() => {});
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  // Malware scan gates visibility — nobody (client or staff list) sees this
  // file until it comes back Clean. Scanning happens inline (bounded wait)
  // so the response already reflects the real outcome.
  const scan = await scanWithVirusTotal(buffer, safeName).catch((e) => ({
    completed: false,
    clean: false,
    detail: String(e),
  }));

  if (scan.completed && scan.clean) {
    await updateDocumentStatus(fileKey, "Clean").catch(() => {});

    after(async () => {
      try {
        const company = contact.referralCompanyId ? await getReferralCompanyById(contact.referralCompanyId).catch(() => null) : null;
        await sendPartnerDocumentSharedNotification({
          tenantId,
          partnerName: contact.name,
          companyName: company?.name,
          fileNames: [safeName],
          note,
          portalUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com"}/partners`,
        });
      } catch (e) {
        console.error("[partner/documents POST] notification failed:", e);
      }
    });

    return NextResponse.json({ ok: true, fileKey, status: "Clean" });
  }

  // Not clean, or the scan didn't finish in time — fail closed.
  await updateDocumentStatus(fileKey, "Quarantined").catch(() => {});
  after(async () => {
    await sendDocumentQuarantineAlert({
      fileKey,
      originalFileName: safeName,
      partnerName: contact.name,
      tenantId,
      detail: scan.detail,
    }).catch(() => {});
  });

  return NextResponse.json({
    ok: true,
    fileKey,
    status: "Quarantined",
    message: "Your file was received and is pending a security review before it becomes visible.",
  });
}
