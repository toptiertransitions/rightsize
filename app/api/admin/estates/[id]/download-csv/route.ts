import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getItemsForEstateSale, getEstateById } from "@/lib/airtable";

export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTAdmin" && sysRole !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [estate, items] = await Promise.all([
    getEstateById(id),
    getItemsForEstateSale(id),
  ]);

  if (!estate) return NextResponse.json({ error: "Estate not found" }, { status: 404 });

  const rows: string[] = [
    ["Item Name", "Category", "Condition", "Status", "Value Low", "Value Mid", "Value High", "Primary Photo URL"].join(","),
  ];

  for (const item of items) {
    const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    rows.push([
      escape(item.itemName),
      escape(item.category),
      escape(item.condition),
      escape(item.status || ""),
      item.valueLow ?? "",
      item.valueMid ?? "",
      item.valueHigh ?? "",
      escape(item.photoUrl || ""),
    ].join(","));
  }

  const csv = rows.join("\r\n");
  const filename = `${estate.name.replace(/[^a-z0-9]/gi, "_")}_items.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
