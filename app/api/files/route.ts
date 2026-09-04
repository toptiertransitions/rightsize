import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { uploadFile, deleteFile } from "@/lib/cloudinary";
import {
  getProjectFiles,
  createProjectFile,
  deleteProjectFile,
  updateProjectFile,
  getUserRoleForTenant,
  getSystemRole,
  getTenantById,
} from "@/lib/airtable";
import { sendDailyRecapNotification } from "@/lib/admin-notifications";
import type { FileTag } from "@/lib/types";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const EDIT_ROLES = ["Owner", "Collaborator", "TTTStaff", "TTTManager", "TTTAdmin"];

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });

  const role = await getUserRoleForTenant(userId, tenantId);
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const files = await getProjectFiles(tenantId);
    return NextResponse.json({ files });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const tenantId = formData.get("tenantId") as string | null;
  const tag = formData.get("tag") as string | null;
  const roomLabel = formData.get("roomLabel") as string | null;
  const vendorId = formData.get("vendorId") as string | null;

  if (!file || !tenantId || !tag) {
    return NextResponse.json({ error: "Missing file, tenantId, or tag" }, { status: 400 });
  }

  // System staff can upload to any project; otherwise check tenant membership
  const sysRolePost = await getSystemRole(userId).catch(() => null);
  if (!sysRolePost || !["TTTStaff", "TTTTeamLead", "TTTManager", "TTTAdmin"].includes(sysRolePost)) {
    const role = await getUserRoleForTenant(userId, tenantId);
    if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const isRecap = tag === "Daily Recap";
    const buffer = Buffer.from(await file.arrayBuffer());

    // For Daily Recap files, rename to a standard format
    let originalFileName = file.name;
    let recapDate: string | undefined;
    let projectName: string | undefined;
    if (isRecap) {
      const tenant = await getTenantById(tenantId).catch(() => null);
      projectName = tenant?.name ?? tenantId;
      // CST date as YYYY-MM-DD
      recapDate = new Date().toLocaleString("sv-SE", { timeZone: "America/Chicago" }).slice(0, 10);
      const ext = file.name.includes(".") ? file.name.split(".").pop() ?? "jpg" : "jpg";
      const cleanName = (projectName ?? "").replace(/[^\w\s\-]/g, "").trim();
      const [y, m, d] = recapDate.split("-");
      originalFileName = `Daily Recap - ${m}-${d}-${y} - ${cleanName}.${ext}`;
    }

    const uploadResult = await uploadFile(buffer, {
      tenantId,
      mimeType: file.type,
      originalFileName,
    });

    const projectFile = await createProjectFile({
      tenantId,
      fileName: originalFileName,
      fileTag: tag as FileTag,
      roomLabel: roomLabel?.trim() || undefined,
      vendorId: vendorId?.trim() || undefined,
      cloudinaryUrl: uploadResult.secureUrl,
      cloudinaryPublicId: uploadResult.publicId,
      resourceType: uploadResult.resourceType,
      recapDate,
    });

    // For Daily Recap: run AI extraction + email asynchronously after response
    if (isRecap && recapDate && projectName) {
      const fileId = projectFile.id;
      const cloudinaryUrl = uploadResult.secureUrl;
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(originalFileName);
      const uploaderClerkId = userId;
      const capturedProjectName = projectName;
      const capturedRecapDate = recapDate;
      const capturedFileName = originalFileName;

      after(async () => {
        try {
          const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
          let aiRecapText = "";

          if (isPdf) {
            const pdfRes = await fetch(cloudinaryUrl);
            const pdfBuf = await pdfRes.arrayBuffer();
            const pdfBase64 = Buffer.from(pdfBuf).toString("base64");
            const response = await anthropic.beta.messages.create({
              model: "claude-sonnet-4-6",
              max_tokens: 4000,
              betas: ["pdfs-2024-09-25"],
              messages: [{
                role: "user",
                content: [
                  { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
                  { type: "text", text: "Transcribe the handwritten notes from this document verbatim. Return only the transcribed text with no commentary, corrections, labels, or additions of any kind." },
                ],
              }],
            });
            aiRecapText = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
          } else {
            // Use Cloudinary URL with f_jpg transform to handle HEIC files
            const jpgUrl = cloudinaryUrl.replace("/upload/", "/upload/f_jpg/");
            const imgRes = await fetch(jpgUrl);
            const imgBuf = await imgRes.arrayBuffer();
            const imgBase64 = Buffer.from(imgBuf).toString("base64");
            const response = await anthropic.messages.create({
              model: "claude-sonnet-4-6",
              max_tokens: 4000,
              messages: [{
                role: "user",
                content: [
                  { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imgBase64 } },
                  { type: "text", text: "Transcribe the handwritten notes from this image verbatim. Return only the transcribed text with no commentary, corrections, labels, or additions of any kind." },
                ],
              }],
            });
            aiRecapText = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
          }

          // Update Airtable record with extracted text
          await updateProjectFile(fileId, { aiRecapText });

          // Send notification email
          await sendDailyRecapNotification({
            projectName: capturedProjectName,
            recapDate: capturedRecapDate,
            uploaderClerkId,
            aiRecapText,
            fileUrl: cloudinaryUrl,
            fileName: capturedFileName,
          });
        } catch (e) {
          console.error("[files POST] Daily recap AI/email failed:", e);
        }
      });
    }

    return NextResponse.json({ file: projectFile });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: string; tenantId?: string; fileName?: string; fileTag?: string; roomLabel?: string; sortOrder?: number; aiRecapText?: string; recapDate?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, tenantId, fileName, fileTag, roomLabel, sortOrder, aiRecapText, recapDate } = body;
  if (!id || !tenantId) {
    return NextResponse.json({ error: "Missing id or tenantId" }, { status: 400 });
  }

  const sysRolePatch = await getSystemRole(userId).catch(() => null);
  if (!sysRolePatch || !["TTTStaff", "TTTTeamLead", "TTTManager", "TTTAdmin"].includes(sysRolePatch)) {
    const role = await getUserRoleForTenant(userId, tenantId);
    if (!role || !EDIT_ROLES.includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const file = await updateProjectFile(id, {
      fileName,
      fileTag: fileTag as FileTag | undefined,
      roomLabel,
      sortOrder,
      aiRecapText,
      recapDate,
    });
    return NextResponse.json({ file });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  const publicId = req.nextUrl.searchParams.get("publicId");
  const resourceType = req.nextUrl.searchParams.get("resourceType");
  const tenantId = req.nextUrl.searchParams.get("tenantId");
  const vendorId = req.nextUrl.searchParams.get("vendorId");
  const tag = req.nextUrl.searchParams.get("tag");

  if (!id || !publicId || !resourceType || !tenantId) {
    return NextResponse.json({ error: "Missing required params" }, { status: 400 });
  }

  const [role, sysRole] = await Promise.all([
    getUserRoleForTenant(userId, tenantId).catch(() => null),
    getSystemRole(userId).catch(() => null),
  ]);
  const isSystemStaff = sysRole && ["TTTStaff", "TTTTeamLead", "TTTManager", "TTTAdmin"].includes(sysRole);
  if (!role && !isSystemStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Payment Proof files: only TTTManager or TTTAdmin can delete
  if (tag === "Payment Proof") {
    if (sysRole !== "TTTManager" && sysRole !== "TTTAdmin") {
      return NextResponse.json({ error: "Forbidden — TTT Manager required" }, { status: 403 });
    }
  } else if (!vendorId && !isSystemStaff && !EDIT_ROLES.includes(role ?? "")) {
    // Vendor file deletes are allowed for any project member; other deletes require edit role
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await deleteFile(publicId, resourceType);
    await deleteProjectFile(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
