import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, createItem } from "@/lib/airtable";
import type { PrimaryRoute, ItemStatus } from "@/lib/types";

const ROUTE_MAP: Record<string, PrimaryRoute> = {
  pfinventory: "ProFoundFinds Consignment",
  pf: "ProFoundFinds Consignment",
  "profoundfinds": "ProFoundFinds Consignment",
  "profoundfinds consignment": "ProFoundFinds Consignment",
  consignment: "ProFoundFinds Consignment",
  fb: "FB/Marketplace",
  facebook: "FB/Marketplace",
  "facebook marketplace": "FB/Marketplace",
  "fb/marketplace": "FB/Marketplace",
  ebay: "Online Marketplace",
  "online marketplace": "Online Marketplace",
  online: "Online Marketplace",
  discard: "Discard",
  donate: "Donate",
  keep: "To Be Moved",
  "to be moved": "To Be Moved",
  "family keeping": "Family to Take",
  "family to take": "Family to Take",
  family: "Family to Take",
  "storage unit": "Storage Unit - Offsite",
  "storage unit - offsite": "Storage Unit - Offsite",
  storage: "Storage Unit - Offsite",
  "leaving with home": "Leaving with Home",
  leaving: "Leaving with Home",
  "other consignment": "Other Consignment",
  other: "Other Consignment",
};

const STATUS_MAP: Record<string, ItemStatus> = {
  sold: "Sold",
  listed: "Listed",
  discarded: "Discarded",
  donated: "Donated",
  approved: "Approved",
  rejected: "Rejected / Revisit",
  "pending review": "Pending Review",
  pending: "Pending Review",
};

function normalizeRoute(raw: string): PrimaryRoute {
  return ROUTE_MAP[raw.toLowerCase().trim()] ?? "Pending Review" as unknown as PrimaryRoute;
}

function normalizeStatus(raw: string): ItemStatus {
  return STATUS_MAP[raw.toLowerCase().trim()] ?? "Pending Review";
}

export interface ImportRow {
  itemName: string;
  tenantId: string;
  quantity?: number;
  estimatedValue?: number;
  clientSharePercent?: number;
  route: string;
  barcode?: string;
  deliveryDate?: string;
  status?: string;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTAdmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { items }: { items: ImportRow[] } = await req.json();
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "No items provided" }, { status: 400 });
  }

  let imported = 0;
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < items.length; i++) {
    const row = items[i];
    if (!row.itemName?.trim() || !row.tenantId) {
      errors.push({ row: i + 1, error: "Missing Item Name or Client" });
      continue;
    }
    try {
      const primaryRoute = normalizeRoute(row.route || "");
      const status = normalizeStatus(row.status || "");
      await createItem({
        tenantId: row.tenantId,
        itemName: row.itemName.trim(),
        valueMid: row.estimatedValue ?? undefined,
        quantity: row.quantity ?? undefined,
        clientSharePercent: row.clientSharePercent ?? undefined,
        primaryRoute,
        barcodeNumber: row.barcode?.trim() || undefined,
        deliveryDate: row.deliveryDate?.trim() || undefined,
        status,
      });
      imported++;
    } catch (e) {
      errors.push({ row: i + 1, error: String(e) });
    }
  }

  return NextResponse.json({ imported, failed: errors.length, errors });
}
