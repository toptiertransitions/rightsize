import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getLocalVendorByClerkId, updateLocalVendor } from "@/lib/airtable";

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { prefCategories: Array<{ category: string; minPrice: number; maxPrice: number }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { prefCategories } = body;
  if (!Array.isArray(prefCategories)) {
    return NextResponse.json({ error: "prefCategories must be an array" }, { status: 400 });
  }
  if (prefCategories.length > 5) {
    return NextResponse.json({ error: "Maximum 5 category preferences allowed" }, { status: 400 });
  }
  for (const slot of prefCategories) {
    if (!slot.category || typeof slot.category !== "string" || !slot.category.trim()) {
      return NextResponse.json({ error: "Each preference slot must have a non-empty category" }, { status: 400 });
    }
  }

  const vendor = await getLocalVendorByClerkId(userId).catch(() => null);
  if (!vendor) {
    return NextResponse.json({ error: "Vendor not found" }, { status: 403 });
  }

  const updated = await updateLocalVendor(vendor.id, { prefCategories });
  return NextResponse.json({ success: true, prefCategories: updated.prefCategories });
}
