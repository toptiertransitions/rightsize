import { NextResponse } from "next/server";
import { getBrandBySlug } from "@/lib/brands/data";
import { toPublicBrand } from "@/lib/brands/shared";

// Public, read-only branding for unauthenticated screens (sign-up, sign-in).
// Active brands only, and never contact details or record ids.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug.toLowerCase()).catch(() => null);
  if (!brand || brand.status !== "Active") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toPublicBrand(brand), { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
}
