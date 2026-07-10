import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getItemsByPrimaryRoute } from "@/lib/airtable";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId);
  if (role !== "TTTAdmin" && role !== "TTTManager") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const allItems = await getItemsByPrimaryRoute("ProFoundFinds Consignment").catch(() => []);
  const items = allItems
    .filter(i => i.status === "Listed" && i.storefrontActive)
    .map(i => ({
      id: i.id,
      itemName: i.itemName,
      photoUrl: i.photoUrl ?? undefined,
      valueMid: i.valueMid ?? undefined,
      onlineListingSlug: i.onlineListingSlug ?? undefined,
      category: i.category ?? undefined,
    }));

  return NextResponse.json({ items });
}
