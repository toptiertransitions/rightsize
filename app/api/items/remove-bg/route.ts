import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { v2 as cloudinary } from "cloudinary";
import { getItemById, getSystemRole, updateItem } from "@/lib/airtable";
import { removeBackgroundFromUrl } from "@/lib/cloudinary";

// Bulk "Remove BG" from the catalog table view, one item per call (removal
// takes up to ~45s, so the client loops). Swaps the PRIMARY photo only for a
// transparent-background copy; the other photos and fields are untouched.
// The original stays in Cloudinary, it just isn't referenced anymore.
export const maxDuration = 60;

const ALLOWED_ROLES = ["TTTStaff", "TTTTeamLead", "TTTManager", "TTTAdmin"];

// True when the photo is already the output of a background removal, so a
// second run doesn't spend another add-on credit for nothing.
async function alreadyRemoved(publicId: string): Promise<boolean> {
  if (!publicId) return false;
  try {
    const res = await cloudinary.api.resource(publicId);
    return res.info?.background_removal?.cloudinary_ai?.status === "complete";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!sysRole || !ALLOWED_ROLES.includes(sysRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { id?: unknown } | null;
  const id = typeof body?.id === "string" && /^rec[A-Za-z0-9]{14}$/.test(body.id) ? body.id : null;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const item = await getItemById(id).catch(() => null);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const photos = item.photos ?? [];
  const primary = photos[0];
  if (!primary?.url) return NextResponse.json({ skipped: "no-photo" });
  if (await alreadyRemoved(primary.publicId)) return NextResponse.json({ skipped: "already-clean" });

  try {
    const cleaned = await removeBackgroundFromUrl(primary.url, { tenantId: item.tenantId });
    const nextPhotos = [{ url: cleaned.secureUrl, publicId: cleaned.publicId }, ...photos.slice(1)];
    await updateItem(id, { photos: nextPhotos });
    return NextResponse.json({ photos: nextPhotos });
  } catch (e) {
    console.error(`[remove-bg] ${id} failed:`, e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Background removal failed" }, { status: 500 });
  }
}
