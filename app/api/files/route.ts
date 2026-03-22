import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { uploadFile, deleteFile } from "@/lib/cloudinary";
import {
  getProjectFiles,
  createProjectFile,
  deleteProjectFile,
  updateProjectFile,
  getUserRoleForTenant,
  getSystemRole,
} from "@/lib/airtable";
import type { FileTag } from "@/lib/types";

export const maxDuration = 30;

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
  if (!sysRolePost || !["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRolePost)) {
    const role = await getUserRoleForTenant(userId, tenantId);
    if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await uploadFile(buffer, {
      tenantId,
      mimeType: file.type,
      resourceType: "auto",
    });

    const projectFile = await createProjectFile({
      tenantId,
      fileName: file.name,
      fileTag: tag as FileTag,
      roomLabel: roomLabel?.trim() || undefined,
      vendorId: vendorId?.trim() || undefined,
      cloudinaryUrl: uploadResult.secureUrl,
      cloudinaryPublicId: uploadResult.publicId,
      resourceType: uploadResult.resourceType,
    });

    return NextResponse.json({ file: projectFile });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: string; tenantId?: string; fileName?: string; fileTag?: string; roomLabel?: string; sortOrder?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, tenantId, fileName, fileTag, roomLabel, sortOrder } = body;
  if (!id || !tenantId) {
    return NextResponse.json({ error: "Missing id or tenantId" }, { status: 400 });
  }

  const sysRolePatch = await getSystemRole(userId).catch(() => null);
  if (!sysRolePatch || !["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRolePatch)) {
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
  const isSystemStaff = sysRole && ["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole);
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
