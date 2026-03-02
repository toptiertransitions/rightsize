import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { uploadFile, deleteFile } from "@/lib/cloudinary";
import {
  getProjectFiles,
  createProjectFile,
  deleteProjectFile,
  getUserRoleForTenant,
} from "@/lib/airtable";
import type { FileTag } from "@/lib/types";

export const maxDuration = 30;

const EDIT_ROLES = ["Owner", "Collaborator", "TTTStaff", "TTTAdmin"];

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

  if (!file || !tenantId || !tag) {
    return NextResponse.json({ error: "Missing file, tenantId, or tag" }, { status: 400 });
  }

  // Any authenticated member may upload
  const role = await getUserRoleForTenant(userId, tenantId);
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await uploadFile(buffer, {
      tenantId,
      mimeType: file.type,
    });

    const projectFile = await createProjectFile({
      tenantId,
      fileName: file.name,
      fileTag: tag as FileTag,
      roomLabel: roomLabel?.trim() || undefined,
      cloudinaryUrl: uploadResult.secureUrl,
      cloudinaryPublicId: uploadResult.publicId,
      resourceType: uploadResult.resourceType,
    });

    return NextResponse.json({ file: projectFile });
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

  if (!id || !publicId || !resourceType || !tenantId) {
    return NextResponse.json({ error: "Missing required params" }, { status: 400 });
  }

  const role = await getUserRoleForTenant(userId, tenantId);
  if (!role || !EDIT_ROLES.includes(role)) {
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
