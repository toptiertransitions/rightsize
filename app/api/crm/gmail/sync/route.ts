import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getActivitiesForOpportunity, createActivity } from "@/lib/airtable";
import { getValidAccessToken, searchGmailMessages, getGmailMessage } from "@/lib/gmail";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTManager" && sysRole !== "TTTAdmin" && sysRole !== "TTTSales") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { opportunityId, query } = await req.json();
  if (!opportunityId || !query) {
    return NextResponse.json({ error: "Missing opportunityId or query" }, { status: 400 });
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(userId);
  } catch (e) {
    const revoked = e instanceof Error && e.message === "GMAIL_TOKEN_REVOKED";
    console.error("[gmail/sync] Token error:", String(e));
    return NextResponse.json({ error: revoked ? "Gmail reconnection required" : "Gmail token error", needs_reconnect: revoked }, { status: 401 });
  }
  console.log("[gmail/sync] query:", query);

  const messages = await searchGmailMessages(accessToken, query, 20);
  console.log("[gmail/sync] messages found:", messages.length);

  // Get existing activities to skip already-imported messages
  const existing = await getActivitiesForOpportunity(opportunityId);
  const importedIds = new Set(existing.filter((a) => a.gmailMessageId).map((a) => a.gmailMessageId!));

  let imported = 0;
  for (const msg of messages) {
    if (importedIds.has(msg.id)) continue;
    try {
      const detail = await getGmailMessage(accessToken, msg.id);
      await createActivity({
        opportunityId,
        type: "Email",
        note: `Subject: ${detail.subject}\nFrom: ${detail.from}\n\n${detail.snippet}`,
        isGmailImported: true,
        gmailMessageId: msg.id,
        gmailThreadId: detail.threadId,
        activityDate: detail.date ? new Date(detail.date).toISOString() : new Date().toISOString(),
        createdByClerkId: userId,
      });
      imported++;
    } catch (err) {
      console.error("[gmail/sync] Failed to import Gmail message:", msg.id, err);
    }
  }

  console.log("[gmail/sync] imported:", imported);
  return NextResponse.json({ imported, messagesFound: messages.length, query });
}
