import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSystemRole } from "@/lib/airtable";
import { buildShopperBlastEmail } from "@/lib/email-blast";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId);
  if (role !== "TTTAdmin" && role !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { subject: string; bodyText: string; featuredEstates?: unknown[]; featuredItems?: unknown[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { subject, bodyText, featuredEstates = [], featuredItems = [] } = body;
  if (!subject || !bodyText) {
    return NextResponse.json({ error: "subject and bodyText are required" }, { status: 400 });
  }

  // Get sender's email from Clerk
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const testEmail = user.emailAddresses[0]?.emailAddress;
  const testName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Admin";
  if (!testEmail) {
    return NextResponse.json({ error: "No email address on your account" }, { status: 400 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail = `ProFoundFinds <${process.env.RESEND_FROM_EMAIL ?? "hello@profoundfinds.com"}>`;

  const html = buildShopperBlastEmail({
    shopperName: testName,
    subject: `[TEST] ${subject}`,
    bodyText,
    featuredEstates: (featuredEstates as Array<{ name: string; slug: string; saleStartDate: string; description: string; status: string }>).map(e => ({
      name: e.name,
      slug: e.slug,
      saleStartDate: e.saleStartDate,
      description: e.description,
      status: e.status,
    })),
    featuredItems: (featuredItems as Array<{ itemName: string; photoUrl?: string; valueMid?: number; currentPrice?: number; onlineListingSlug?: string; estateSlug?: string; itemId?: string; category?: string }>).map(i => ({
      itemName: i.itemName,
      photoUrl: i.photoUrl,
      valueMid: i.valueMid,
      currentPrice: i.currentPrice,
      onlineListingSlug: i.onlineListingSlug,
      estateSlug: i.estateSlug,
      itemId: i.itemId,
      category: i.category,
    })),
    unsubscribeUrl: "#",
  });

  await resend.emails.send({
    from: fromEmail,
    to: [testEmail],
    replyTo: "info@profoundfinds.com",
    subject: `[TEST] ${subject}`,
    html,
  });

  return NextResponse.json({ sentTo: testEmail });
}
