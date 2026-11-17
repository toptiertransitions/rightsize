export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getItemById, getSystemRole, getTenantById } from "@/lib/airtable";
import { AUTOMATED_LABEL_SIZE, renderLabelPDF } from "@/lib/label-pdf";
import type { LabelItem, LabelMode } from "@/lib/label-pdf";
import { chicagoToday, dropSettings, priceSchedule } from "@/lib/pricing/autoDrop";
import type { Tenant } from "@/lib/types";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!["TTTStaff", "TTTTeamLead", "TTTManager", "TTTAdmin"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { items: LabelItem[]; widthIn: number; heightIn: number; mode?: LabelMode };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { items, widthIn = 2, heightIn = 1 } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "No items provided" }, { status: 400 });
  }

  // Automated pricing: 4" x 2", with the price-drop schedule worked out
  // here from the item's own record (its delivery date, listed price and
  // project settings) so the tag matches what the daily drop will charge.
  // Items not listed yet count from today.
  const mode: LabelMode = body.mode === "automated" ? "automated" : "simple";
  let labelItems = items;
  if (mode === "automated") {
    const today = chicagoToday();
    const tenants = new Map<string, Promise<Tenant | null>>();
    labelItems = await Promise.all(items.map(async (li) => {
      const item = await getItemById(li.id).catch(() => null);
      if (!item) return li;
      if (!tenants.has(item.tenantId)) tenants.set(item.tenantId, getTenantById(item.tenantId).catch(() => null));
      const sched = priceSchedule(item, dropSettings(await tenants.get(item.tenantId)!), today);
      return {
        id: item.id,
        itemName: item.itemName,
        price: sched?.current ?? item.valueMid ?? 0,
        barcodeNumber: item.barcodeNumber,
        // Only drops still to come (a reprint after a drop shows the next one)
        schedule: sched?.steps.filter((st) => st.day > today && st.price < sched.current).map((st) => ({ day: st.day, price: st.price })),
      };
    }));
  }

  try {
    const size = mode === "automated" ? AUTOMATED_LABEL_SIZE : { widthIn, heightIn };
    const pdf = await renderLabelPDF({ items: labelItems, ...size, mode });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="labels-${Date.now()}.pdf"`,
      },
    });
  } catch (e) {
    console.error("Label PDF generation failed:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
