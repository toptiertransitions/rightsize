import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getItemsForEstateSale } from "@/lib/airtable";

// GET /api/admin/blast-context/estate-items?estateIds=id1,id2
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId);
  if (role !== "TTTAdmin" && role !== "TTTManager") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const estateIds = (req.nextUrl.searchParams.get("estateIds") ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (estateIds.length === 0) return NextResponse.json({ groups: [] });

  const groups = await Promise.all(
    estateIds.map(async (estateId) => {
      const items = await getItemsForEstateSale(estateId).catch(() => []);
      return {
        estateId,
        items: items
          .filter(i => i.status === "Listed" || i.status === "In Cart")
          .map(i => ({
            id: i.id,
            itemName: i.itemName,
            photoUrl: i.photoUrl ?? undefined,
            valueMid: i.valueMid ?? undefined,
            category: i.category ?? undefined,
            onlineListingSlug: i.onlineListingSlug ?? undefined,
          })),
      };
    })
  );

  return NextResponse.json({ groups });
}
