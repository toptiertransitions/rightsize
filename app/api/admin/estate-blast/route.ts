import crypto from "crypto";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getAllShoppers, getSystemRole } from "@/lib/airtable";
import { buildShopperBlastEmail } from "@/lib/email-blast";

export const runtime = "nodejs";

interface FeaturedEstate {
  id: string;
  name: string;
  slug: string;
  saleStartDate: string;
  description: string;
  status: string;
}

interface FeaturedItem {
  id: string;
  itemName: string;
  photoUrl?: string;
  valueMid?: number;
  onlineListingSlug?: string;
  category?: string;
}

interface BlastRequest {
  subject: string;
  bodyText: string;
  shopperIds?: string[];
  filterCategory?: string;
  featuredEstates: FeaturedEstate[];
  featuredItems: FeaturedItem[];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request): Promise<NextResponse> {
  const { userId } = await auth();
  const role = await getSystemRole(userId ?? "");
  if (role !== "TTTAdmin" && role !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: BlastRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    subject,
    bodyText,
    shopperIds,
    filterCategory,
    featuredEstates = [],
    featuredItems = [],
  } = body;

  if (!subject || !bodyText) {
    return NextResponse.json(
      { error: "subject and bodyText are required" },
      { status: 400 }
    );
  }

  // Fetch all shoppers
  let allShoppers;
  try {
    allShoppers = await getAllShoppers();
  } catch (err) {
    console.error("[estate-blast] getAllShoppers failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch shoppers" },
      { status: 500 }
    );
  }

  // Filter: exclude opted-out
  let eligible = allShoppers.filter((s) => !s.optOut);

  // Filter to specific shopper IDs if provided
  if (shopperIds && shopperIds.length > 0) {
    const idSet = new Set(shopperIds);
    eligible = eligible.filter((s) => idSet.has(s.id));
  }

  // Filter by category interest if provided
  if (filterCategory && filterCategory.trim().length > 0) {
    const cat = filterCategory.trim().toLowerCase();
    eligible = eligible.filter(
      (s) =>
        s.categoryInterests &&
        s.categoryInterests.toLowerCase().includes(cat)
    );
  }

  const total = eligible.length;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const secret = process.env.SHOPPERS_UNSUBSCRIBE_SECRET || "pf-unsub-secret";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.toptiertransitions.com";
  const fromEmail = `ProFoundFinds <${process.env.RESEND_FROM_EMAIL ?? "hello@profoundfinds.com"}>`;

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < eligible.length; i++) {
    const shopper = eligible[i];

    try {
      const sig = crypto
        .createHmac("sha256", secret)
        .update(shopper.id)
        .digest("hex");
      const unsubscribeUrl = `${appUrl}/api/shoppers/unsubscribe?id=${shopper.id}&sig=${sig}`;

      const html = buildShopperBlastEmail({
        shopperName: shopper.name,
        subject,
        bodyText,
        featuredEstates: featuredEstates.map((e) => ({
          name: e.name,
          slug: e.slug,
          saleStartDate: e.saleStartDate,
          description: e.description,
          status: e.status,
        })),
        featuredItems: featuredItems.map((item) => ({
          itemName: item.itemName,
          photoUrl: item.photoUrl,
          valueMid: item.valueMid,
          onlineListingSlug: item.onlineListingSlug,
          category: item.category,
        })),
        unsubscribeUrl,
      });

      await resend.emails.send({
        from: fromEmail,
        to: [shopper.email],
        replyTo: "info@profoundfinds.com",
        subject,
        html,
      });

      sent++;
    } catch (err) {
      console.error(`[estate-blast] Failed to send to ${shopper.email}:`, err);
      failed++;
    }

    // Rate-limit courtesy delay between sends (skip after last)
    if (i < eligible.length - 1) {
      await delay(150);
    }
  }

  return NextResponse.json({ sent, failed, total });
}
