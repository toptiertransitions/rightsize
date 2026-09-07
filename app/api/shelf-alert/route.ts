import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getStaffMembers, getTenantById } from "@/lib/airtable";
import { isTTTAdmin } from "@/lib/config";
import { buildShelfAlertEmail } from "@/lib/email";
import { Resend } from "resend";
import type { ShelfAlertSessionLog } from "@/lib/email";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    tenantId: string;
    shelfImageUrl: string;
    sessionLog: ShelfAlertSessionLog;
  };
  const { tenantId, shelfImageUrl, sessionLog } = body;

  const [tenant, clerk, staff] = await Promise.all([
    getTenantById(tenantId).catch(() => null),
    clerkClient(),
    getStaffMembers().catch(() => []),
  ]);

  const tenantName = tenant?.name ?? "Unknown Project";

  const uploader = await clerk.users.getUser(userId).catch(() => null);
  const uploaderName = uploader
    ? ([uploader.firstName, uploader.lastName].filter(Boolean).join(" ") || "Staff")
    : "Staff";
  const uploaderEmail = uploader?.emailAddresses?.[0]?.emailAddress;

  const activeStaff = staff.filter(s => s.isActive && s.email);
  const recipientEmails = [
    ...activeStaff
      .filter(s => s.role === "TTTAdmin" || s.role === "TTTManager" || isTTTAdmin(s.clerkUserId))
      .map(s => s.email as string),
    ...(uploaderEmail ? [uploaderEmail] : []),
  ];
  const uniqueRecipients = [...new Set(recipientEmails)];

  if (uniqueRecipients.length === 0) {
    return NextResponse.json({ sent: false, reason: "No recipients" });
  }

  const assessedAt = new Date().toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });

  const html = buildShelfAlertEmail({ tenantName, uploaderName, shelfImageUrl, sessionLog, assessedAt });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "hello@toptiertransitions.com";

  await resend.emails.send({
    from: `Top Tier Transitions <${fromEmail}>`,
    to: uniqueRecipients,
    subject: `Internal Alert — Shelf Assessed at ${tenantName} by ${uploaderName}`,
    html,
  });

  return NextResponse.json({ sent: true, recipients: uniqueRecipients.length });
}
