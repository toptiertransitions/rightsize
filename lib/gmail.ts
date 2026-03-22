import {
  getGmailToken,
  saveGmailToken,
  getClientContacts,
  getReferralContacts,
  getActivitiesForContact,
  createActivity,
} from "./airtable";
import type { ZellePayment } from "./types";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function getGmailAuthUrl(state?: string): string {
  const clientId = process.env.GOOGLE_CRM_CLIENT_ID!;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI!;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
  });
  if (state) params.set("state", state);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  email: string;
}> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CRM_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CRM_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  const data = await res.json();

  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  // Fetch email from userinfo
  const userRes = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const userInfo = userRes.ok ? await userRes.json() : {};

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || "",
    expiresAt,
    email: userInfo.email || "",
  };
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CRM_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CRM_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const data = await res.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  return { accessToken: data.access_token, expiresAt };
}

export async function getValidAccessToken(clerkUserId: string): Promise<string> {
  const token = await getGmailToken(clerkUserId);
  if (!token) throw new Error("No Gmail token found for user");

  const expiresAt = new Date(token.expiresAt).getTime();
  const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;

  if (expiresAt > fiveMinutesFromNow) {
    return token.accessToken;
  }

  if (!token.refreshToken) {
    throw new Error("NO_REFRESH_TOKEN");
  }

  // Refresh
  const { accessToken, expiresAt: newExpiresAt } = await refreshAccessToken(token.refreshToken);
  await saveGmailToken(clerkUserId, {
    accessToken,
    refreshToken: token.refreshToken,
    expiresAt: newExpiresAt,
    email: token.email,
  });
  return accessToken;
}

export interface GmailMessage {
  id: string;
  threadId: string;
}

export async function searchGmailMessages(
  accessToken: string,
  query: string,
  maxResults = 20
): Promise<GmailMessage[]> {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Gmail search failed: ${await res.text()}`);
  const data = await res.json();
  return data.messages || [];
}

export async function runGmailSyncAll(
  clerkUserId: string
): Promise<{ imported: number; contactsSearched: number }> {
  const accessToken = await getValidAccessToken(clerkUserId);

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
          createdByClerkId: clerkUserId,
        });
        totalImported++;
        importedIds.add(msg.id);
      } catch (err) {
        console.error("[gmail/sync-all] Failed to import message", msg.id, err);
      }
    }
  }

  console.log(
    `[gmail/sync-all] userId=${clerkUserId} imported=${totalImported} contactsSearched=${contactsSearched} totalContacts=${allContacts.length}`
  );
  return { imported: totalImported, contactsSearched };
}

export async function getGmailMessage(
  accessToken: string,
  messageId: string
): Promise<{ subject: string; from: string; date: string; snippet: string; threadId: string }> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Gmail message fetch failed: ${await res.text()}`);
  const data = await res.json();

  const headers: Array<{ name: string; value: string }> = data.payload?.headers || [];
  const get = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

  return {
    subject: get("Subject"),
    from: get("From"),
    date: get("Date"),
    snippet: data.snippet || "",
    threadId: data.threadId || "",
  };
}

// ─── Zelle Payment Parsing ────────────────────────────────────────────────────

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|td|tr|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractPlainText(payload: Record<string, unknown>): string {
  const mimeType = payload.mimeType as string;
  const body = payload.body as { data?: string } | undefined;
  const parts = payload.parts as Record<string, unknown>[] | undefined;
  if (mimeType === "text/plain" && body?.data) return decodeBase64Url(body.data);
  if (mimeType === "text/html" && body?.data) return htmlToText(decodeBase64Url(body.data));
  if (parts) {
    // Prefer text/plain first
    for (const part of parts) {
      if ((part as Record<string, unknown>).mimeType === "text/plain") {
        const text = extractPlainText(part);
        if (text) return text;
      }
    }
    // Fall back to any part (including html)
    for (const part of parts) {
      const text = extractPlainText(part);
      if (text) return text;
    }
  }
  return "";
}

function parseZelleEmail(body: string): Omit<ZellePayment, "messageId"> | null {
  // Payer: handles both "NAME sent you" (plain text) and "payment NAME sent you" (HTML-derived)
  const payerMatch = body.match(/(?:payment\s+)?(.+?)\s+sent you\b/i);
  const amountMatch = body.match(/Amount\s+\$?([\d,]+\.?\d*)/i);
  const sentOnMatch = body.match(/Sent on\s+(.+)/i);
  const memoMatch = body.match(/Memo\s+(.+)/i);
  if (!payerMatch || !amountMatch || !sentOnMatch) return null;
  const dateStr = sentOnMatch[1].trim();
  const parsed = new Date(dateStr);
  const sentOn = isNaN(parsed.getTime()) ? dateStr : parsed.toISOString().split("T")[0];
  const memo = memoMatch ? memoMatch[1].trim() : "";
  // Strip quoted-reply markers ("> ", ">> ", etc.) that appear in forwarded emails
  const payerName = payerMatch[1].trim().replace(/^[>\s]+/, "").trim();
  return {
    payerName,
    amount: parseFloat(amountMatch[1].replace(/,/g, "")),
    sentOn,
    memo: memo === "N/A" ? "" : memo,
  };
}

export async function fetchZellePayments(
  accessToken: string,
  days: number | "all"
): Promise<ZellePayment[]> {
  const base = `subject:"You received money with Zelle"`;
  const query = days === "all" ? base : `${base} newer_than:${days}d`;
  const messages = await searchGmailMessages(accessToken, query, 100);
  const results: ZellePayment[] = [];
  for (const msg of messages) {
    try {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const body = extractPlainText(data.payload ?? {});
      const parsed = parseZelleEmail(body);
      if (parsed) results.push({ messageId: msg.id, ...parsed });
    } catch {
      continue;
    }
  }
  // Deduplicate: same payer + amount + date can appear across forwarded email threads
  const seen = new Set<string>();
  const deduped = results.filter((p) => {
    const key = `${p.payerName.toLowerCase()}|${p.amount}|${p.sentOn}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return deduped.sort((a, b) => b.sentOn.localeCompare(a.sentOn));
}
