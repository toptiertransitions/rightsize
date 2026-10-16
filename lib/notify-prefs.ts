/**
 * Inbox notification settings, presence, and quiet hours — stored in
 * Upstash Redis (fast reads for every push fan-out, no Airtable schema).
 * When Redis isn't configured (local dev), defaults apply, presence is
 * never recorded, and saving settings reports that it's unavailable.
 * See lib/message-notify.ts for how these are used.
 */
import "server-only";
import { Redis } from "@upstash/redis";
import type { Tenant } from "./types";

export type NotifyLevel = "all" | "mentions" | "none";

export interface QuietHours {
  enabled: boolean;
  /** "21:00" in Central Time */
  start: string;
  /** "07:00" in Central Time */
  end: string;
}

export interface NotifyPrefs {
  /** Explicit per-project choices; missing = the default for that project. */
  projects: Record<string, NotifyLevel>;
  quiet: QuietHours;
}

export const DEFAULT_QUIET: QuietHours = { enabled: false, start: "21:00", end: "07:00" };
const PRESENCE_TTL_S = 45;

let redisClient: Redis | null | undefined;
function redis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  redisClient = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? Redis.fromEnv() : null;
  return redisClient;
}

export function notificationsStoreConfigured(): boolean {
  return !!redis();
}

const prefsKey = (userId: string) => `inbox:prefs:${userId}`;
const presenceKey = (userId: string) => `inbox:viewing:${userId}`;

export async function getNotifyPrefs(userId: string): Promise<NotifyPrefs> {
  const r = redis();
  const stored = r ? await r.get<NotifyPrefs>(prefsKey(userId)).catch(() => null) : null;
  return { projects: stored?.projects ?? {}, quiet: { ...DEFAULT_QUIET, ...(stored?.quiet ?? {}) } };
}

export async function getNotifyPrefsMany(userIds: string[]): Promise<Map<string, NotifyPrefs>> {
  const out = new Map<string, NotifyPrefs>();
  const r = redis();
  const ids = Array.from(new Set(userIds));
  const values = r && ids.length ? await r.mget<(NotifyPrefs | null)[]>(...ids.map(prefsKey)).catch(() => ids.map(() => null)) : ids.map(() => null);
  ids.forEach((id, i) => {
    const v = values[i];
    out.set(id, { projects: v?.projects ?? {}, quiet: { ...DEFAULT_QUIET, ...(v?.quiet ?? {}) } });
  });
  return out;
}

export async function saveNotifyPrefs(userId: string, update: { tenantId?: string; level?: NotifyLevel | null; quiet?: QuietHours }): Promise<NotifyPrefs> {
  const r = redis();
  if (!r) throw new Error("Notification settings aren't available right now.");
  const prefs = await getNotifyPrefs(userId);
  if (update.tenantId) {
    if (update.level) prefs.projects[update.tenantId] = update.level;
    else delete prefs.projects[update.tenantId];
  }
  if (update.quiet) prefs.quiet = update.quiet;
  await r.set(prefsKey(userId), prefs);
  return prefs;
}

/** The level a person gets on a project when they haven't chosen one. */
export function defaultProjectLevel(userId: string, tenant: Pick<Tenant, "teamLeadClerkId"> | null | undefined): NotifyLevel {
  return tenant?.teamLeadClerkId === userId ? "all" : "mentions";
}

// ─── Presence ────────────────────────────────────────────────────────────────

export async function setViewing(userId: string, tenantId: string | null): Promise<void> {
  const r = redis();
  if (!r) return;
  if (tenantId) await r.set(presenceKey(userId), tenantId, { ex: PRESENCE_TTL_S });
  else await r.del(presenceKey(userId));
}

export async function viewingMany(userIds: string[]): Promise<Map<string, string>> {
  const r = redis();
  const out = new Map<string, string>();
  if (!r || userIds.length === 0) return out;
  const values = await r.mget<(string | null)[]>(...userIds.map(presenceKey)).catch(() => userIds.map(() => null));
  userIds.forEach((id, i) => { if (values[i]) out.set(id, values[i]!); });
  return out;
}

// ─── Quiet hours ─────────────────────────────────────────────────────────────

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function inQuietHours(q: QuietHours, now = new Date()): boolean {
  if (!q.enabled) return false;
  const [h, m] = now.toLocaleTimeString("en-GB", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
  const t = h * 60 + m;
  const s = minutes(q.start);
  const e = minutes(q.end);
  return s === e ? false : s < e ? t >= s && t < e : t >= s || t < e;
}
