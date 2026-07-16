export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole } from "@/lib/airtable";
import { getValidAccessToken, sendGmailMessage } from "@/lib/gmail";
import { clerkClient } from "@clerk/nextjs/server";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getSystemRole(userId);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { subject, bodyHtml, attachmentUrl } = await req.json() as {
    subject: string;
    bodyHtml: string;
    attachmentUrl?: string;
  };

  if (!bodyHtml) return NextResponse.json({ error: "bodyHtml required" }, { status: 400 });

  const accessToken = await getValidAccessToken(userId);
  const clerk = await clerkClient();
  const user = await clerk.users.getUser(userId);
  const toEmail = user.emailAddresses[0]?.emailAddress ?? "";
  const fromName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Top Tier Transitions";

  if (!toEmail) return NextResponse.json({ error: "No email address on your account" }, { status: 400 });

  // Substitute merge tags with the sender's own info for the test
  const filledHtml = bodyHtml
    .replace(/\{\{first_name\}\}/g, user.firstName ?? "there")
    .replace(/\{\{last_name\}\}/g, user.lastName ?? "")
    .replace(/\{\{rep_first_name\}\}/g, user.firstName ?? "")
    .replace(/\{\{company\}\}/g, "Test Company");

  // Fetch attachment if provided
  let attachment: { data: Buffer; name: string; mimeType: string } | undefined;
  if (attachmentUrl) {
    try {
      const fileRes = await fetch(attachmentUrl);
      if (fileRes.ok) {
        const mimeType = fileRes.headers.get("content-type") || "application/octet-stream";
        const urlPath = new URL(attachmentUrl).pathname;
        const attachName = decodeURIComponent(urlPath.split("/").pop() || "attachment");
        attachment = { data: Buffer.from(await fileRes.arrayBuffer()), name: attachName, mimeType };
      }
    } catch { /* best-effort */ }
  }

  await sendGmailMessage({
    accessToken,
    to: toEmail,
    fromName,
    fromEmail: toEmail,
    subject: `[TEST] ${subject || "(no subject)"}`,
    htmlBody: filledHtml,
    attachment,
  });

  return NextResponse.json({ ok: true });
}
