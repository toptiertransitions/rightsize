// Team shoutouts: Team Leads, Managers and Admins recognize any TTT team
// member. Stored in the Shoutouts Airtable table; shown on every staff home
// page (team-wide feed) and emailed to the recipient with leadership CC'd.
import { AIRTABLE_TABLES } from "./config";
import type { SystemRole } from "./types";

export const SHOUTOUT_AUTHOR_ROLES: SystemRole[] = ["TTTTeamLead", "TTTManager", "TTTAdmin"];
// CC'd on every shoutout email (besides the recipient, who is the To).
export const SHOUTOUT_CC_ROLES: SystemRole[] = ["TTTTeamLead", "TTTManager", "TTTAdmin", "TTTSales"];
export const SHOUTOUT_MAX_LENGTH = 1500;

export interface Shoutout {
  id: string;
  message: string;
  recipientClerkId: string;
  recipientName: string;
  authorClerkId: string;
  authorName: string;
  createdAt: string; // ISO
}

export function canGiveShoutout(role: SystemRole | null | undefined): boolean {
  return !!role && SHOUTOUT_AUTHOR_ROLES.includes(role);
}

function atFetch(path: string, options?: RequestInit) {
  return fetch(`https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLES.SHOUTOUTS)}${path}`, {
    cache: "no-store",
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function mapShoutout(r: { id: string; fields: Record<string, unknown> }): Shoutout {
  const f = r.fields;
  return {
    id: r.id,
    message: str(f["Message"]),
    recipientClerkId: str(f["RecipientClerkId"]),
    recipientName: str(f["RecipientName"]),
    authorClerkId: str(f["AuthorClerkId"]),
    authorName: str(f["AuthorName"]),
    createdAt: str(f["CreatedAt"]),
  };
}

/** Most recent shoutouts, newest first. Empty (never throws) if the table isn't set up yet. */
export async function getRecentShoutouts(limit = 50): Promise<Shoutout[]> {
  try {
    const res = await atFetch(`?pageSize=${Math.min(limit, 100)}&sort[0][field]=CreatedAt&sort[0][direction]=desc`);
    if (!res.ok) {
      console.error("[shoutouts] list failed:", res.status, await res.text().catch(() => ""));
      return [];
    }
    const data = await res.json();
    return (data.records as { id: string; fields: Record<string, unknown> }[]).map(mapShoutout).filter((s) => s.message);
  } catch (e) {
    console.error("[shoutouts] list failed:", e);
    return [];
  }
}

/** Every shoutout created at or after `sinceIso`, newest first. Empty (never throws) on failure. */
export async function getShoutoutsSince(sinceIso: string): Promise<Shoutout[]> {
  const out: Shoutout[] = [];
  try {
    let offset = "";
    for (let page = 0; page < 10; page++) {
      const res = await atFetch(`?pageSize=100&sort[0][field]=CreatedAt&sort[0][direction]=desc${offset ? `&offset=${offset}` : ""}`);
      if (!res.ok) {
        console.error("[shoutouts] since failed:", res.status, await res.text().catch(() => ""));
        break;
      }
      const data = await res.json();
      const batch = (data.records as { id: string; fields: Record<string, unknown> }[]).map(mapShoutout);
      for (const s of batch) {
        if (s.createdAt < sinceIso) return out;
        if (s.message) out.push(s);
      }
      if (!data.offset) break;
      offset = data.offset;
    }
  } catch (e) {
    console.error("[shoutouts] since failed:", e);
  }
  return out;
}

export async function getShoutout(id: string): Promise<Shoutout | null> {
  const res = await atFetch(`/${id}`);
  if (!res.ok) return null;
  return mapShoutout(await res.json());
}

export async function createShoutout(data: {
  message: string;
  recipientClerkId: string;
  recipientName: string;
  recipientEmail: string;
  authorClerkId: string;
  authorName: string;
}): Promise<Shoutout> {
  const res = await atFetch("", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        Message: data.message,
        RecipientClerkId: data.recipientClerkId,
        RecipientName: data.recipientName,
        RecipientEmail: data.recipientEmail,
        AuthorClerkId: data.authorClerkId,
        AuthorName: data.authorName,
        CreatedAt: new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return mapShoutout(await res.json());
}

export async function markShoutoutEmailed(id: string): Promise<void> {
  await atFetch(`/${id}`, { method: "PATCH", body: JSON.stringify({ fields: { EmailedAt: new Date().toISOString() } }) }).catch(() => {});
}

export async function deleteShoutout(id: string): Promise<void> {
  const res = await atFetch(`/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}
