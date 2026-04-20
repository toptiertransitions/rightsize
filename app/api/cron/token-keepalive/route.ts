import { NextRequest, NextResponse } from "next/server";
import { getValidQBOToken } from "@/lib/qbo";
import { getSquareLocationName } from "@/lib/square";

// Runs every 6 hours to keep QBO and Square tokens fresh.
// QBO access tokens expire after 1 hour — proactively refreshing here ensures
// the stored token is always valid, so user-facing invoice flows never hit
// an expired-token error mid-operation.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  // ── QBO: proactively refresh access token ─────────────────────────────────
  try {
    const token = await getValidQBOToken();
    if (!token) {
      results.qbo = { ok: false, error: "No token or token revoked — reconnect at /admin/invoicing" };
      console.warn("[token-keepalive] QBO: no valid token");
    } else {
      results.qbo = { ok: true, realmId: token.realmId };
      console.log("[token-keepalive] QBO: token refreshed/valid");
    }
  } catch (e) {
    results.qbo = { ok: false, error: String(e) };
    console.error("[token-keepalive] QBO error:", e);
  }

  // ── Square: verify API connectivity ───────────────────────────────────────
  try {
    const configured = !!(
      process.env.SQUARE_ACCESS_TOKEN &&
      process.env.SQUARE_LOCATION_ID &&
      process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
    );
    if (!configured) {
      results.square = { ok: false, error: "Square env vars not configured" };
    } else {
      const locationName = await getSquareLocationName();
      if (!locationName) {
        results.square = { ok: false, error: "Could not reach Square API" };
        console.warn("[token-keepalive] Square: API unreachable");
      } else {
        results.square = { ok: true, locationName };
        console.log(`[token-keepalive] Square: connected (${locationName})`);
      }
    }
  } catch (e) {
    results.square = { ok: false, error: String(e) };
    console.error("[token-keepalive] Square error:", e);
  }

  const allOk = Object.values(results).every((r) => (r as { ok: boolean }).ok);
  return NextResponse.json({ success: true, allOk, ...results });
}
