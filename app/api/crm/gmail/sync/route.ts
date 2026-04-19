import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getActivitiesForOpportunity, createActivity, getAllGmailTokens } from "@/lib/airtable";
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

  console.log("[gmail/sync] query:", query);

  // Search ALL connected Gmail accounts so emails sent by any team member are found,
  // regardless of which user's account is currently logged in.
  const allTokens = await getAllGmailTokens().catch(() => []);
  if (allTokens.length === 0) {
    return NextResponse.json({ error: "No Gmail accounts connected" }, { status: 401 });
  }

  // Get existing activities to skip already-imported messages
  const existing = await getActivitiesForOpportunity(opportunityId);
  const importedIds = new Set(existing.filter((a) => a.gmailMessageId).map((a) => a.gmailMessageId!));

  // Collect all message IDs across accounts to deduplicate (same message can appear in multiple accounts)
  const seenMessageIds = new Set<string>(importedIds);

  let imported = 0;
  let totalFound = 0;

  for (const gmailToken of allTokens) {
    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(gmailToken.clerkUserId);
    } catch (e) {
      console.warn(`[gmail/sync] Skipping token for ${gmailToken.clerkUserId} — ${String(e)}`);
      continue;
    }

    const messages = await searchGmailMessages(accessToken, query, 20).catch(() => []);
    totalFound += messages.length;

    for (const msg of messages) {
      if (seenMessageIds.has(msg.id)) continue;
      seenMessageIds.add(msg.id);
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
  }

  console.log(`[gmail/sync] searched ${allTokens.length} account(s), found ${totalFound} messages, imported ${imported}`);
  return NextResponse.json({ imported, messagesFound: totalFound, query });
}
