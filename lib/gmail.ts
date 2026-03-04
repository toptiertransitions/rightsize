import { getGmailToken, saveGmailToken } from "./airtable";

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
