import http2 from "node:http2";
import jwt from "jsonwebtoken";
import { getDeviceTokensForUsers, unregisterDeviceToken } from "./airtable";

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

function isPushConfigured(): boolean {
  return !!(process.env.APNS_TEAM_ID && process.env.APNS_KEY_ID && process.env.APNS_PRIVATE_KEY && process.env.APNS_BUNDLE_ID);
}

interface PushPayload {
  title: string;
  body: string;
  /** In-app path to open on tap, e.g. "/inbox" — read client-side from the notification's data. */
  url?: string;
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
      aps: { alert: { title: payload.title, body: payload.body }, sound: "default" },
      url: payload.url,
    }));
    req.end();
  });
}

// Pushes a notification to every registered device belonging to the given
// Clerk users. Silently no-ops if APNs isn't configured yet, and never
// throws — this is always a best-effort supplement to email, never a
// caller's critical path.
export async function sendPushToClerkUsers(clerkUserIds: string[], payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) {
    console.log("[push-send] APNs not configured — skipping push (set APNS_TEAM_ID / APNS_KEY_ID / APNS_PRIVATE_KEY / APNS_BUNDLE_ID)");
    return;
  }
  try {
    const devices = await getDeviceTokensForUsers(clerkUserIds);
    const iosDevices = devices.filter((d) => d.platform === "iOS");
    if (iosDevices.length === 0) return;

    const jwtToken = signProviderToken();
    const results = await Promise.all(
      iosDevices.map(async (d) => ({ device: d, result: await sendOne(d.token, jwtToken, payload) }))
    );
    await Promise.all(
      results.filter((r) => r.result === "bad-token").map((r) => unregisterDeviceToken(r.device.token))
    );
  } catch (e) {
    console.error("[push-send] failed:", e);
  }
}
