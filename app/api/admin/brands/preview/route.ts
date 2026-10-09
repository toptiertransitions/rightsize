import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { canPreviewBrands } from "@/lib/brands/resolve";
import { getBrandById } from "@/lib/brands/data";
import { PREVIEW_COOKIE, signValue } from "@/lib/brands/cookies";

// "View as" brand preview for TTTAdmin/TTTManager. Display only: it sets a
// signed cookie that lib/brands/resolve.ts honors for these roles alone.
const MAX_AGE = 60 * 60 * 8;

async function requirePreviewer() {
  const { userId } = await auth();
  if (!userId) return null;
  const role = await getSystemRole(userId).catch(() => null);
  return canPreviewBrands(role) ? userId : null;
}

export async function POST(req: NextRequest) {
  if (!(await requirePreviewer())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { brandId } = (await req.json().catch(() => ({}))) as { brandId?: string };
  const res = NextResponse.json({ ok: true });
  if (!brandId) {
    res.cookies.delete(PREVIEW_COOKIE);
    return res;
  }
  const brand = await getBrandById(brandId);
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  res.cookies.set(PREVIEW_COOKIE, signValue(brand.id, MAX_AGE), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: MAX_AGE });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(PREVIEW_COOKIE);
  return res;
}
