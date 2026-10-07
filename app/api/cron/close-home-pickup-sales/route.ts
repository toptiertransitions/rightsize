export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getEstates, updateEstate } from "@/lib/airtable";
import { homePickupEndsAtMs } from "@/lib/home-pickup";

// Runs hourly (vercel.json). Flips live Home Pickup sales to Closed once
// their pickup window has ended. The public site already stops showing a
// sale the moment its window ends (see isHomePickupLive), so this only
// keeps admin's status in sync. Closed sales stay visible in admin.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const estates = await getEstates();
  const toClose = estates.filter((e) => {
    if (e.saleType !== "Home Pickup" || e.status !== "Active") return false;
    const endsAt = homePickupEndsAtMs(e);
    return endsAt !== null && now >= endsAt;
  });

  const closed: string[] = [];
  for (const e of toClose) {
    try {
      await updateEstate(e.id, { status: "Closed" });
      closed.push(e.name);
    } catch (err) {
      console.error(`[cron/close-home-pickup-sales] Failed to close ${e.id}:`, err);
    }
  }
  console.log(`[cron/close-home-pickup-sales] Closed ${closed.length}: ${closed.join(", ")}`);
  return NextResponse.json({ closed });
}
