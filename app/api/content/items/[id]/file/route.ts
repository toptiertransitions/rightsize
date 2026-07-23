import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { getContentItemById } from "@/lib/airtable-content";

export const maxDuration = 30;

interface Context { params: Promise<{ id: string }> }

const CONTENT_TYPES: Record<string, string> = {
  PDF: "application/pdf",
  Image: "image/jpeg",
  Video: "video/mp4",
};

const EXTENSIONS: Record<string, string> = {
  PDF: ".pdf",
  Video: ".mp4",
};

export async function GET(_req: NextRequest, { params }: Context) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const item = await getContentItemById(id);
  if (!item?.fileUrl) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const upstream = await fetch(item.fileUrl);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "File unavailable" }, { status: 502 });
  }

  const contentType = CONTENT_TYPES[item.contentType] ?? "application/octet-stream";
  const ext = EXTENSIONS[item.contentType] ?? "";
  const safeName = item.title
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80) || "file";
  const filename = `${safeName}${ext}`;

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
