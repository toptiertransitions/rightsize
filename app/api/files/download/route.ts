import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getProjectFileById, getUserRoleForTenant, getSystemRole } from "@/lib/airtable";

const MIME_MAP: Record<string, string> = {
  pdf:  "application/pdf",
  png:  "image/png",
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  gif:  "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  svg:  "image/svg+xml",
  doc:  "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls:  "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function mimeForFile(fileName: string, resourceType: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (MIME_MAP[ext]) return MIME_MAP[ext];
  if (resourceType === "image") return "image/jpeg";
  return "application/octet-stream";
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const file = await getProjectFileById(id).catch(() => null);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Auth check: sys staff can access any file; others need tenant membership
  const [role, sysRole] = await Promise.all([
    getUserRoleForTenant(userId, file.tenantId).catch(() => null),
    getSystemRole(userId).catch(() => null),
  ]);
  const isSystemStaff = sysRole && ["TTTStaff", "TTTManager", "TTTAdmin", "TTTSales"].includes(sysRole);
  if (!role && !isSystemStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Fetch the file from Cloudinary
  const upstream = await fetch(file.cloudinaryUrl);
  if (!upstream.ok) return NextResponse.json({ error: "Failed to fetch file" }, { status: 502 });

  const contentType = mimeForFile(file.fileName, file.resourceType);
  const disposition = contentType === "application/pdf"
    ? `inline; filename="${file.fileName}"`
    : `attachment; filename="${file.fileName}"`;

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
