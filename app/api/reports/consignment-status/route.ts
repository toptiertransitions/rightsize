export const runtime = "nodejs";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { isTTTAdmin } from "@/lib/config";
import { getTenants, getItemsByPrimaryRoute, getStaffMembers } from "@/lib/airtable";
import { REPORT_ROUTES, buildConsignmentReport, buildConsignmentStatusEmail } from "@/lib/consignment-status-report";

// "Consignment Status for Me" on /admin/invoicing: read-only. Emails the
// clicker (and only the clicker) a weekly Ops briefing on every Post Move
// Consignment project's ProFoundFinds / eBay / FB Marketplace items.
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isTTTAdmin(userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
  if (!email) return NextResponse.json({ error: "No email on your account" }, { status: 400 });

  try {
    const [tenants, staff, ...byRoute] = await Promise.all([
      getTenants(),
      getStaffMembers().catch(() => []),
      ...REPORT_ROUTES.map((r) => getItemsByPrimaryRoute(r)),
    ]);
    const report = buildConsignmentReport(tenants, byRoute.flat(), staff);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com";
    const { subject, html } = buildConsignmentStatusEmail(report, user.firstName || "", appUrl);

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "hello@toptiertransitions.com",
      to: email,
      subject,
      html,
    });
    if (error) throw new Error(`Resend: ${error.message}`);

    console.log(`[consignment-status] sent to ${email}: ${report.totals.items} items, ${report.totals.projects} projects`);
    return NextResponse.json({ ok: true, email, ...report.totals });
  } catch (e) {
    console.error("[consignment-status] failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to build the report" }, { status: 500 });
  }
}
