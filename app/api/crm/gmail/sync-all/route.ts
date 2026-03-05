import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getSystemRole,
  getClientContacts,
  getReferralContacts,
  getActivitiesForContact,
  createActivity,
} from "@/lib/airtable";
import { getValidAccessToken, searchGmailMessages, getGmailMessage } from "@/lib/gmail";

export async function POST(req: NextRequest) {
  void req;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId);
  if (sysRole !== "TTTManager" && sysRole !== "TTTAdmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const accessToken = await getValidAccessToken(userId);

  // Merge all contacts (both types) into a flat list
  const [clientContacts, referralContacts] = await Promise.all([
    getClientContacts(),
    getReferralContacts(),
  ]);

  const allContacts = [
    ...clientContacts.map((c) => ({ id: c.id, email: c.email, name: c.name })),
    ...referralContacts.map((c) => ({ id: c.id, email: c.email, name: c.name })),
  ].filter((c) => !!c.email?.trim());

  let totalImported = 0;
  let contactsSearched = 0;

  for (const contact of allContacts) {
    const email = contact.email.toLowerCase().trim();

    let messages;
    try {
      messages = await searchGmailMessages(accessToken, `from:${email} OR to:${email}`, 20);
    } catch (err) {
      console.error("[gmail/sync-all] Search failed for", email, err);
      continue;
    }
    if (!messages.length) continue;

    contactsSearched++;

    // Get already-imported message IDs for this contact
    const existing = await getActivitiesForContact(contact.id);
    const importedIds = new Set(
      existing.filter((a) => a.gmailMessageId).map((a) => a.gmailMessageId!)
    );

    for (const msg of messages) {
      if (importedIds.has(msg.id)) continue;
      try {
        const detail = await getGmailMessage(accessToken, msg.id);
        await createActivity({
          clientContactId: contact.id,
          type: "Email",
          note: `Subject: ${detail.subject}\nFrom: ${detail.from}\n\n${detail.snippet}`,
          isGmailImported: true,
          gmailMessageId: msg.id,
          gmailThreadId: detail.threadId,
          activityDate: detail.date
            ? new Date(detail.date).toISOString()
            : new Date().toISOString(),
          createdByClerkId: userId,
        });
        totalImported++;
        importedIds.add(msg.id);
      } catch (err) {
        console.error("[gmail/sync-all] Failed to import message", msg.id, err);
      }
    }
  }

  console.log(
    `[gmail/sync-all] imported=${totalImported} contactsSearched=${contactsSearched} totalContacts=${allContacts.length}`
  );
  return NextResponse.json({ imported: totalImported, contactsSearched });
}
