export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { buildVendorMappingPrompt, callVendorMappingAI, enforceRoutingConstraints } from "@/lib/vendorMapping";
import type { Item, LocalVendor } from "@/lib/types";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!["TTTStaff", "TTTManager", "TTTAdmin"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { projectZip, items, vendors }: {
    projectZip: string;
    items: Item[];
    vendors: LocalVendor[];
  } = body;

  try {
    const promptItems = items.map(i => ({
      itemId: i.id,
      itemName: i.itemName,
      category: i.category,
      primaryRoute: i.primaryRoute,
      valueMid: i.valueMid,
      condition: i.condition,
    }));
    const promptVendors = vendors.map(v => ({
      vendorId: v.id,
      vendorName: v.vendorName,
      vendorType: v.vendorType,
      city: v.city,
      itemCategories: v.itemCategories,
      consignmentTake: v.consignmentTake,
    }));

    const prompt = buildVendorMappingPrompt(projectZip, promptItems, promptVendors);
    const raw = await callVendorMappingAI(prompt);
    const assignments = enforceRoutingConstraints(raw, items, vendors);
    return NextResponse.json({ assignments });
  } catch (e) {
    console.error("map-to-vendors error:", e);
    return NextResponse.json({ error: "AI mapping failed — please try again" }, { status: 422 });
  }
}
