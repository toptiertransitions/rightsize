import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getEstates, createEstate } from "@/lib/airtable";

async function requireTTT(userId: string) {
  const role = await getSystemRole(userId);
  return role === "TTTAdmin" || role === "TTTManager";
}

export async function GET(req: NextRequest) {
  void req;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireTTT(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const estates = await getEstates();
    return NextResponse.json({ estates });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await requireTTT(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = await req.json();
    if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!body.slug?.trim()) return NextResponse.json({ error: "Slug is required" }, { status: 400 });
    const estate = await createEstate({
      name: body.name.trim(),
      slug: body.slug.trim(),
      tenantId: body.tenantId || "",
      description: body.description || "",
      status: body.status || "Upcoming",
      saleStartDate: body.saleStartDate || "",
      saleStartTime: body.saleStartTime || "",
      saleEndDate: body.saleEndDate || "",
      saleEndTime: body.saleEndTime || "",
      dropIntervalHours: body.dropIntervalHours ?? 48,
      dropPercent: body.dropPercent ?? 10,
      floorPercent: body.floorPercent ?? 40,
      pickupAddress: body.pickupAddress || "",
      pickupWindowStart: body.pickupWindowStart || "",
      pickupWindowEnd: body.pickupWindowEnd || "",
      shippingAvailable: body.shippingAvailable ?? false,
      shippingNotes: body.shippingNotes || "",
      hideSoldItems: body.hideSoldItems ?? false,
      terms: body.terms || "",
      contactEmail: body.contactEmail || "",
      contactPhone: body.contactPhone || "",
      cityRegion: body.cityRegion || "",
      featuredImageUrl: body.featuredImageUrl || "",
      featuredImagePublicId: body.featuredImagePublicId || "",
      saleType: body.saleType || "Online",
      galleryJson: body.galleryJson || "",
    });
    return NextResponse.json({ estate }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
