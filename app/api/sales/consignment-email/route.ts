import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { getSystemRole, getTenantById, getItemsForTenant } from "@/lib/airtable";
import { buildPriceDropEmail, buildUnsoldItemsEmail, type PriceDropEmailItem, type UnsoldEmailItem } from "@/lib/email";
import type { PrimaryRoute } from "@/lib/types";

const CONSIGNMENT_ROUTES: PrimaryRoute[] = [
  "ProFoundFinds Consignment",
  "FB/Marketplace",
  "Online Marketplace",
  "Other Consignment",
  "Estate Sale",
];

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}


export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTManager" && sysRole !== "TTTAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { tenantId, type } = body as { tenantId: string; type: "drop1" | "drop2" | "unsold" };
  if (!tenantId || !type) return NextResponse.json({ error: "Missing tenantId or type" }, { status: 400 });

  const [tenant, allItems, clerkUser] = await Promise.all([
    getTenantById(tenantId),
    getItemsForTenant(tenantId),
    (async () => {
      const client = await clerkClient();
      return client.users.getUser(userId);
    })(),
  ]);

  if (!tenant) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const userEmail = clerkUser.emailAddresses[0]?.emailAddress;
  if (!userEmail) return NextResponse.json({ error: "No email on your account" }, { status: 400 });

  const listedItems = allItems.filter(i =>
    i.status === "Listed" && CONSIGNMENT_ROUTES.includes(i.primaryRoute)
  );

  // Earliest delivery date across all consignment items
  const deliveryDates = allItems
    .map(i => i.deliveryDate)
    .filter((d): d is string => !!d)
    .sort();
  const earliestDelivery = deliveryDates[0] ?? null;

  const drop1Days = tenant.priceDrop1Days ?? 30;
  const drop1Pct = tenant.priceDrop1Percent ?? 33;
  const drop2Days = tenant.priceDrop2Days ?? 60;
  const drop2Pct = tenant.priceDrop2Percent ?? 66;

  const generatedAt = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  let html: string;
  let subject: string;

  if (type === "drop1" || type === "drop2") {
    const isFirst = type === "drop1";
    const dropDays = isFirst ? drop1Days : drop2Days;
    const dropPct = isFirst ? drop1Pct : drop2Pct;
    const dropNumber: 1 | 2 = isFirst ? 1 : 2;

    const dropDateStr = earliestDelivery ? addDays(earliestDelivery, dropDays) : `Day ${dropDays}`;

    const emailItems: PriceDropEmailItem[] = listedItems.map(item => {
      const currentPrice = item.valueMid ?? 0;
      const futurePrice = Math.round(currentPrice * (1 - dropPct / 100));
      return {
        itemName: item.itemName,
        primaryRoute: item.primaryRoute,
        currentPrice,
        futurePrice,
      };
    });

    subject = `Price Drop ${dropNumber} — ${tenant.name} (${listedItems.length} items)`;
    html = buildPriceDropEmail({
      tenantName: tenant.name,
      dropNumber,
      dropDate: dropDateStr,
      dropPercent: dropPct,
      items: emailItems,
      generatedAt,
    });
  } else {
    // unsold
    const unsoldDateStr = earliestDelivery ? addDays(earliestDelivery, 90) : "Day 90";
    const specialSituationIds = new Set((tenant.unsoldSpecialSituations ?? []).map(s => s.itemId));
    const standardPref = tenant.unsoldStandardPreference ?? "";

    const emailItems: UnsoldEmailItem[] = listedItems.map(item => {
      const isSpecial = specialSituationIds.has(item.id);
      let action: string;
      if (!standardPref) {
        action = isSpecial ? "Special — contact client" : "No preference set";
      } else if (isSpecial) {
        action = standardPref === "Donate" ? "Return to client" : "Donate";
      } else {
        action = standardPref === "Donate" ? "Donate" : "Return to client";
      }
      return {
        itemName: item.itemName,
        primaryRoute: item.primaryRoute,
        currentPrice: item.valueMid ?? 0,
        action,
        isSpecialSituation: isSpecial,
      };
    });

    subject = `Unsold Items Action Summary — ${tenant.name} (${listedItems.length} items)`;
    html = buildUnsoldItemsEmail({
      tenantName: tenant.name,
      unsoldDate: earliestDelivery ? addDays(earliestDelivery, 90) : "Day 90",
      standardPreference: standardPref,
      items: emailItems,
      generatedAt,
    });
  }

  const { error } = await resend.emails.send({
    from: "hello@toptiertransitions.com",
    to: userEmail,
    subject,
    html,
  });

  if (error) {
    console.error("[consignment-email] resend error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }

  return NextResponse.json({ success: true, sentTo: userEmail, itemCount: listedItems.length });
}
