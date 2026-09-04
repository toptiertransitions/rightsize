import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSystemRole, getStaffMembers, updateItem, logItemStatusChange } from "@/lib/airtable";
import { upsertSquareCatalogItem } from "@/lib/square";

const TERMINAL_STATUSES = ["Sold", "Donated", "Discarded", "Rejected / Revisit"];
const ALLOWED_ROLES = ["TTTStaff", "TTTTeamLead", "TTTManager", "TTTAdmin"];

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { items } = await req.json() as {
    items: Array<{
      id: string;
      itemName: string;
      tenantId: string;
      status: string;
      primaryRoute: string;
      valueMid?: number;
      barcodeNumber?: string;
      squareCatalogItemId?: string;
      squareCatalogVariationId?: string;
    }>;
  };

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "No items provided" }, { status: 400 });
  }

  const resolveChangerName = async (): Promise<string> => {
    const staffList = await getStaffMembers().catch(() => []);
    const staff = staffList.find(s => s.clerkUserId === userId);
    if (staff?.displayName) return staff.displayName;
    try {
      const client = await clerkClient();
      const u = await client.users.getUser(userId);
      return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.emailAddresses[0]?.emailAddress || userId;
    } catch { return userId; }
  };

  const locationId = process.env.SQUARE_LOCATION_ID;
  const errors: Array<{ id: string; name: string; reason: string }> = [];
  const squareErrors: Array<{ id: string; name: string; error: string }> = [];
  let listed = 0;
  let skipped = 0;
  let changedBy: string | null = null;

  for (const item of items) {
    if (TERMINAL_STATUSES.includes(item.status)) {
      errors.push({ id: item.id, name: item.itemName, reason: item.status });
      continue;
    }
    if (item.status === "Listed") {
      skipped++;
      continue;
    }

    await updateItem(item.id, { status: "Listed", storefrontActive: true });
    listed++;

    if (!changedBy) changedBy = await resolveChangerName();
    logItemStatusChange({
      itemId: item.id,
      itemName: item.itemName,
      tenantId: item.tenantId,
      oldStatus: item.status,
      newStatus: "Listed",
      changedBy,
      source: "Bulk List",
    }).catch(() => {});

    if (item.primaryRoute === "ProFoundFinds Consignment" && locationId && item.barcodeNumber) {
      try {
        const { catalogItemId, catalogVariationId } = await upsertSquareCatalogItem({
          existingItemId: item.squareCatalogItemId,
          existingVariationId: item.squareCatalogVariationId,
          name: item.itemName,
          priceCents: Math.round((item.valueMid ?? 0) * 100),
          sku: item.barcodeNumber,
          locationId,
        });
        await updateItem(item.id, {
          squareCatalogItemId: catalogItemId,
          squareCatalogVariationId: catalogVariationId,
          squareSyncedAt: new Date().toISOString(),
        });
      } catch (e) {
        squareErrors.push({ id: item.id, name: item.itemName, error: String(e) });
      }
      await new Promise(r => setTimeout(r, 50));
    }
  }

  return NextResponse.json({ listed, skipped, errors, squareErrors });
}
