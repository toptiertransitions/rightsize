import http2 from "node:http2";
import jwt from "jsonwebtoken";
import { getDeviceTokensForUsers, unregisterDeviceToken, logPushAttempt, type PushLogType } from "./airtable";

// ─── APNs provider JWT ─────────────────────────────────────────────────────────
// Apple's HTTP/2 API auths each request with a short-lived JWT signed by an
// APNs Authentication Key (.p8), not a long-lived certificate. Re-signed on
// every call rather than cached across invocations — cheap (one ES256 sign),
// and serverless functions don't reliably share module-scope state between
// invocations anyway, so caching would save little and risks sending a stale
// token past Apple's ~1hr recommended lifetime.
// Normalizes APNS_PRIVATE_KEY into a real PEM string no matter how it was
// pasted into the env var: quoted (stray leading/trailing " or '), with
// escaped \n sequences instead of real newlines, or base64-encoded (a common
// way people store multi-line secrets in env vars to sidestep newline
// handling entirely).
function normalizeApnsPrivateKey(raw: string): string {
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  if (!key.includes("BEGIN PRIVATE KEY")) {
    try {
      const decoded = Buffer.from(key, "base64").toString("utf8");
      if (decoded.includes("BEGIN PRIVATE KEY")) key = decoded;
    } catch {}
  }
  return key.includes("BEGIN PRIVATE KEY") ? key.replace(/\\n/g, "\n") : key;
}

function signProviderToken(): string {
  const teamId = process.env.APNS_TEAM_ID;
  const keyId = process.env.APNS_KEY_ID;
  const rawKey = process.env.APNS_PRIVATE_KEY;
  if (!teamId || !keyId || !rawKey) {
    throw new Error("APNS_TEAM_ID / APNS_KEY_ID / APNS_PRIVATE_KEY not configured");
  }
  const privateKey = normalizeApnsPrivateKey(rawKey);
  return jwt.sign({ iss: teamId, iat: Math.floor(Date.now() / 1000) }, privateKey, {
    algorithm: "ES256",
    keyid: keyId,
  });
}

function isApnsConfigured(): boolean {
  return !!(process.env.APNS_TEAM_ID && process.env.APNS_KEY_ID && process.env.APNS_PRIVATE_KEY && process.env.APNS_BUNDLE_ID);
}

// ─── FCM (Android) ─────────────────────────────────────────────────────────────
// Firebase Cloud Messaging HTTP v1, authed with the Firebase service account
// in FIREBASE_SERVICE_ACCOUNT_JSON (the downloaded key file's JSON, raw or
// base64). Signs a short-lived JWT and trades it for a Google access token,
// reused across sends within an invocation until shortly before it expires.
interface FcmCredentials { projectId: string; clientEmail: string; privateKey: string }

function fcmCredentials(): FcmCredentials | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const j = JSON.parse(text) as { project_id?: string; client_email?: string; private_key?: string };
    if (!j.project_id || !j.client_email || !j.private_key) return null;
    return { projectId: j.project_id, clientEmail: j.client_email, privateKey: j.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

let fcmTokenCache: { token: string; expiresAt: number } | null = null;

async function fcmAccessToken(creds: FcmCredentials): Promise<string> {
  if (fcmTokenCache && fcmTokenCache.expiresAt > Date.now() + 60_000) return fcmTokenCache.token;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: creds.clientEmail, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 },
    creds.privateKey,
    { algorithm: "RS256" }
  );
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) throw new Error(`FCM auth failed: ${data.error ?? res.status}`);
  fcmTokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

/** Android notification channels (created by the app; see PushNotificationBootstrap). */
type AndroidChannel = "urgent" | "general" | "fyi";

function channelFor(type: PushLogType): AndroidChannel {
  return type === "Urgent" ? "urgent" : "general";
}

async function sendOneFcm(deviceToken: string, accessToken: string, projectId: string, payload: PushPayload, channel: AndroidChannel): Promise<"ok" | "bad-token" | "error"> {
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title: payload.title, body: payload.body },
          data: payload.url ? { url: payload.url } : {},
          android: {
            // Delivery priority (doze): everything time-sensitive is HIGH;
            // only FYI waits for the next maintenance window.
            priority: channel === "fyi" ? "NORMAL" : "HIGH",
            notification: {
              channel_id: channel,
              ...(payload.threadId ? { tag: payload.threadId } : {}),
              sound: channel === "fyi" ? undefined : "default",
              notification_priority: channel === "urgent" ? "PRIORITY_HIGH" : channel === "fyi" ? "PRIORITY_LOW" : "PRIORITY_DEFAULT",
            },
          },
        },
      }),
    });
    if (res.ok) return "ok";
    const raw = await res.text();
    // A dead or malformed token: FCM says UNREGISTERED (404) or rejects the token itself (400)
    if (res.status === 404 || /UNREGISTERED|registration token/i.test(raw)) return "bad-token";
    console.error(`[push-send] FCM ${res.status} for token ${deviceToken.slice(0, 8)}…: ${raw.slice(0, 300)}`);
    return "error";
  } catch (e) {
    console.error("[push-send] FCM request failed:", e);
    return "error";
  }
}

interface PushPayload {
  title: string;
  body: string;
  /** In-app path to open on tap, e.g. "/inbox" — read client-side from the notification's data. */
  url?: string;
  /** Groups notifications by conversation: iOS stacks them (thread-id);
   * Android keeps one notification per conversation, showing the newest (tag). */
  threadId?: string;
}

// Sends one push to one APNs device token. Resolves to "ok", "bad-token" (the
// token is dead — caller should deregister it), or "error" (transient —
// leave the token registered, it may work next time).
async function sendOne(deviceToken: string, jwtToken: string, payload: PushPayload): Promise<"ok" | "bad-token" | "error"> {
  const bundleId = process.env.APNS_BUNDLE_ID!;
  const host = (process.env.APNS_ENVIRONMENT ?? "production") === "development"
    ? "api.sandbox.push.apple.com"
    : "api.push.apple.com";

  return new Promise((resolve) => {
    const client = http2.connect(`https://${host}`);
    client.on("error", () => { resolve("error"); });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${jwtToken}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    let status = 0;
    req.on("response", (headers) => { status = Number(headers[":status"] ?? 0); });

    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      client.close();
      if (status === 200) return resolve("ok");
      if (status === 400 || status === 410) {
        try {
          const reason = JSON.parse(raw)?.reason;
          if (reason === "BadDeviceToken" || reason === "Unregistered") return resolve("bad-token");
        } catch {}
      }
      console.error(`[push-send] APNs ${status} for token ${deviceToken.slice(0, 8)}…: ${raw}`);
      resolve("error");
    });
    req.on("error", () => { client.close(); resolve("error"); });

    req.write(JSON.stringify({
      aps: { alert: { title: payload.title, body: payload.body }, sound: "default", ...(payload.threadId ? { "thread-id": payload.threadId } : {}) },
      url: payload.url,
    }));
    req.end();
  });
}

// Pushes a notification to every registered device belonging to the given
// Clerk users. Silently no-ops if APNs isn't configured yet, and never
// throws — this is always a best-effort supplement to email, never a
// caller's critical path. Every attempt is logged (lib/airtable.ts
// logPushAttempt) so a "did my reminder actually send" question is
// debuggable — one row per recipient, not per device.
export async function sendPushToClerkUsers(
  clerkUserIds: string[],
  payload: PushPayload,
  log: { type: PushLogType; shiftId?: string }
): Promise<void> {
  const apns = isApnsConfigured();
  const fcm = fcmCredentials();
  if (!apns && !fcm) {
    console.log("[push-send] Neither APNs nor FCM is configured — skipping push");
    for (const clerkUserId of clerkUserIds) {
      await logPushAttempt({ clerkUserId, shiftId: log.shiftId, type: log.type, result: "Failed", detail: "Push not configured" });
    }
    return;
  }
  try {
    // One send per physical device, even if a token was saved twice
    const seenTokens = new Set<string>();
    const devices = (await getDeviceTokensForUsers(clerkUserIds)).filter((d) => {
      if (seenTokens.has(d.token)) return false;
      seenTokens.add(d.token);
      return true;
    });
    // Each token is sent once, through its own platform's service
    const iosDevices = apns ? devices.filter((d) => d.platform === "iOS") : [];
    const androidDevices = fcm ? devices.filter((d) => d.platform === "Android") : [];
    const sendable = [...iosDevices, ...androidDevices];

    const devicedUserIds = new Set(sendable.map((d) => d.clerkUserId));
    for (const clerkUserId of clerkUserIds) {
      if (!devicedUserIds.has(clerkUserId)) {
        await logPushAttempt({ clerkUserId, shiftId: log.shiftId, type: log.type, result: "SkippedNoDevice" });
      }
    }
    if (sendable.length === 0) return;

    const results: Array<{ device: (typeof devices)[number]; result: "ok" | "bad-token" | "error" }> = [];
    if (iosDevices.length > 0) {
      const jwtToken = signProviderToken();
      results.push(...await Promise.all(
        iosDevices.map(async (d) => ({ device: d, result: await sendOne(d.token, jwtToken, payload) }))
      ));
    }
    if (androidDevices.length > 0 && fcm) {
      const accessToken = await fcmAccessToken(fcm).catch((e) => { console.error("[push-send]", e); return null; });
      const channel = channelFor(log.type);
      results.push(...await Promise.all(
        androidDevices.map(async (d) => ({
          device: d,
          result: accessToken ? await sendOneFcm(d.token, accessToken, fcm.projectId, payload, channel) : ("error" as const),
        }))
      ));
    }

    await Promise.all(
      results.filter((r) => r.result === "bad-token").map((r) => unregisterDeviceToken(r.device.token))
    );
    // One log row per recipient — if they have multiple devices, "Sent" wins
    // over "Failed" if at least one device succeeded.
    const byUser = new Map<string, "ok" | "bad-token" | "error">();
    for (const r of results) {
      const prev = byUser.get(r.device.clerkUserId);
      if (prev !== "ok") byUser.set(r.device.clerkUserId, r.result);
    }
    for (const [clerkUserId, outcome] of byUser) {
      await logPushAttempt({
        clerkUserId,
        shiftId: log.shiftId,
        type: log.type,
        result: outcome === "ok" ? "Sent" : "Failed",
        detail: outcome !== "ok" ? outcome : undefined,
      });
    }
  } catch (e) {
    console.error("[push-send] failed:", e);
    for (const clerkUserId of clerkUserIds) {
      await logPushAttempt({ clerkUserId, shiftId: log.shiftId, type: log.type, result: "Failed", detail: String(e) });
    }
  }
}
