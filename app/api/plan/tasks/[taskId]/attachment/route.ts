export const runtime = "nodejs";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, updateProjectTask } from "@/lib/airtable";
import { uploadFile } from "@/lib/cloudinary";

const MANAGER_ROLES = ["TTTManager", "TTTAdmin"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !MANAGER_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { taskId } = await params;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const tenantId = formData.get("tenantId") as string | null;
  if (!file || !tenantId) {
    return NextResponse.json({ error: "Missing file or tenantId" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const isImage = file.type.startsWith("image/");

  try {
    const uploaded = await uploadFile(buffer, {
      folder: `rightsize/${tenantId}/task-attachments`,
      tenantId,
      mimeType: file.type,
      resourceType: isImage ? "image" : "raw",
    });

    const task = await updateProjectTask(taskId, {
      attachmentUrl: uploaded.secureUrl,
      attachmentName: file.name,
      attachmentPublicId: uploaded.publicId,
    });

    return NextResponse.json({ task });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
