import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { google } from "googleapis";
import {
  getCalendarToken,
  getAllGmailTokens,
  getStaffMembers,
  getGmailToken,
  saveGmailToken,
  deleteGmailToken,
  getQBOToken,
} from "@/lib/airtable";
import { getValidQBOToken } from "@/lib/qbo";
import { getSquareLocationName } from "@/lib/square";

const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Calendar live test ────────────────────────────────────────────────────────
async function checkCalendarIntegration(): Promise<{
  ok: boolean;
  email: string;
  error?: string;
}> {
  try {
    const stored = await getCalendarToken().catch(() => null);
    const refreshToken =
      stored?.refreshToken || process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;

    if (!refreshToken) {
      return { ok: false, email: stored?.email || "toptiertransitionscalendar@gmail.com", error: "No refresh token stored — reconnect at /admin/calendar-auth" };
    }

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({ refresh_token: refreshToken });

    // Live test: list events on the configured calendar (uses calendar.events scope)
    const calendar = google.calendar({ version: "v3", auth });
    const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
    await calendar.events.list({ calendarId, maxResults: 1, singleEvents: true });

    return { ok: true, email: stored?.email || "toptiertransitionscalendar@gmail.com" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isRevoked = msg.includes("invalid_grant") || msg.includes("Token has been expired or revoked");
    return {
      ok: false,
      email: "toptiertransitionscalendar@gmail.com",
      error: isRevoked
        ? "Token revoked — reconnect at /admin/calendar-auth"
        : `API error: ${msg}`,
    };
  }
}

// ─── Gmail token refresh helper ────────────────────────────────────────────────
async function refreshGmailToken(
  clerkUserId: string
): Promise<{ accessToken: string; expiresAt: string }> {
  const token = await getGmailToken(clerkUserId);
  if (!token?.refreshToken) throw new Error("GMAIL_TOKEN_REVOKED");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: token.refreshToken,
      client_id: process.env.GOOGLE_CRM_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CRM_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    if (body.includes("invalid_grant")) throw new Error("GMAIL_TOKEN_REVOKED");
    throw new Error(`Refresh failed: ${body}`);
  }

  const data = await res.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  await saveGmailToken(clerkUserId, {
    accessToken: data.access_token,
    expiresAt,
    refreshToken: token.refreshToken,
    email: token.email,
  });

  return { accessToken: data.access_token, expiresAt };
}

// ─── Gmail integration check (and proactive refresh) ──────────────────────────
interface GmailCheckResult {
  clerkUserId: string;
  email: string;
  displayName: string;
  ok: boolean;
  error?: string;
  wasRefreshed?: boolean;
}

async function checkAndRefreshGmailTokens(
  staffByClerkId: Map<string, { displayName: string; email: string; role?: string }>,
  staffMembers: { clerkUserId: string; displayName: string; email: string; role: string; isActive: boolean }[]
): Promise<GmailCheckResult[]> {
  const tokens = await getAllGmailTokens();
  const results: GmailCheckResult[] = [];
  const seenClerkIds = new Set<string>();

  for (const token of tokens) {
    const staff = staffByClerkId.get(token.clerkUserId);
    const displayName = staff?.displayName || token.email;
    // Skip test accounts — not relevant to production integration monitoring
    if (/test/i.test(displayName)) continue;
    seenClerkIds.add(token.clerkUserId);

    if (!token.refreshToken) {
      results.push({
        clerkUserId: token.clerkUserId,
        email: token.email,
        displayName,
        ok: false,
        error: "No refresh token — user must reconnect Gmail",
      });
      continue;
    }

    const expiresAt = new Date(token.expiresAt).getTime();
    const eightHoursFromNow = Date.now() + 8 * 60 * 60 * 1000;

    // Proactively refresh if expiring within 8 hours
    if (expiresAt <= eightHoursFromNow) {
      try {
        await refreshGmailToken(token.clerkUserId);
        results.push({ clerkUserId: token.clerkUserId, email: token.email, displayName, ok: true, wasRefreshed: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "GMAIL_TOKEN_REVOKED") {
          await deleteGmailToken(token.id).catch(() => {});
          results.push({ clerkUserId: token.clerkUserId, email: token.email, displayName, ok: false, error: "Token revoked — user must reconnect Gmail at /admin/gmail-auth" });
        } else {
          results.push({ clerkUserId: token.clerkUserId, email: token.email, displayName, ok: false, error: `Refresh error: ${msg}` });
        }
      }
    } else {
      // Token is fresh enough — assume OK (will be verified next time it's used)
      results.push({ clerkUserId: token.clerkUserId, email: token.email, displayName, ok: true });
    }
  }

  // Surface active TTTAdmin/TTTSales staff who have no token row at all
  for (const s of staffMembers) {
    if (!s.isActive) continue;
    if (!["TTTAdmin", "TTTSales"].includes(s.role)) continue;
    if (/test/i.test(s.displayName)) continue;
    if (seenClerkIds.has(s.clerkUserId)) continue;
    results.push({
      clerkUserId: s.clerkUserId,
      email: s.email || "",
      displayName: s.displayName,
      ok: false,
      error: "Not connected — user must connect Gmail at /admin/gmail-auth",
    });
  }

  return results;
}

// ─── Square integration check ─────────────────────────────────────────────────
async function checkSquareIntegration(): Promise<{
  ok: boolean;
  locationName: string;
  error?: string;
}> {
  const configured = !!(
    process.env.SQUARE_ACCESS_TOKEN &&
    process.env.SQUARE_LOCATION_ID &&
    process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
  );
  if (!configured) {
    return { ok: false, locationName: "", error: "Square env vars not configured" };
  }
  try {
    const locationName = await getSquareLocationName();
    if (!locationName) return { ok: false, locationName: "", error: "Could not reach Square API — check SQUARE_ACCESS_TOKEN" };
    return { ok: true, locationName };
  } catch (e) {
    return { ok: false, locationName: "", error: `Square error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── QuickBooks integration check ─────────────────────────────────────────────
async function checkQuickBooksIntegration(): Promise<{
  ok: boolean;
  companyName: string;
  realmId?: string;
  wasRefreshed?: boolean;
  error?: string;
}> {
  try {
    const stored = await getQBOToken().catch(() => null);
    if (!stored) {
      return { ok: false, companyName: "", error: "No QuickBooks connection found — reconnect at /admin/invoicing" };
    }

    // getValidQBOToken attempts a refresh if the access token is near expiry,
    // and clears the stored token + returns null if the refresh token is revoked.
    const tokenBefore = stored.expiresAt;
    const valid = await getValidQBOToken().catch((e: Error) => {
      throw e;
    });

    if (!valid) {
      return {
        ok: false,
        companyName: stored.companyName || "",
        error: "Token revoked — reconnect QuickBooks at /admin/invoicing",
      };
    }

    const freshStored = await getQBOToken().catch(() => stored);
    const wasRefreshed = freshStored?.expiresAt !== tokenBefore;

    return {
      ok: true,
      companyName: freshStored?.companyName || stored.companyName || "",
      realmId: valid.realmId,
      wasRefreshed,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, companyName: "", error: `QBO error: ${msg}` };
  }
}

// ─── HTML email builder ────────────────────────────────────────────────────────
function buildHealthEmail(
  calResult: { ok: boolean; email: string; error?: string },
  gmailResults: GmailCheckResult[],
  qboResult: { ok: boolean; companyName: string; realmId?: string; wasRefreshed?: boolean; error?: string },
  squareResult: { ok: boolean; locationName: string; error?: string },
  checkedAt: string
): string {
  const allOk = calResult.ok && gmailResults.every((r) => r.ok) && qboResult.ok && squareResult.ok;
  const failCount = (calResult.ok ? 0 : 1) + gmailResults.filter((r) => !r.ok).length + (qboResult.ok ? 0 : 1) + (squareResult.ok ? 0 : 1);

  const statusBadge = (ok: boolean) =>
    ok
      ? `<span style="background:#16a34a;color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">CONNECTED</span>`
      : `<span style="background:#dc2626;color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">DISCONNECTED</span>`;

  const refreshNote = (r: GmailCheckResult) =>
    r.wasRefreshed ? `<br><span style="color:#6b7280;font-size:11px;">Token proactively refreshed</span>` : "";

  const gmailRows = gmailResults.map(
    (r) => `
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:12px 16px;font-family:Inter,sans-serif;font-size:14px;color:#1f2937;">${r.displayName}</td>
      <td style="padding:12px 16px;font-family:Inter,sans-serif;font-size:13px;color:#6b7280;">${r.email}</td>
      <td style="padding:12px 16px;">${statusBadge(r.ok)}${refreshNote(r)}</td>
      <td style="padding:12px 16px;font-family:Inter,sans-serif;font-size:13px;color:#dc2626;">${r.error || ""}</td>
    </tr>`
  ).join("");

  const noGmailMsg = gmailResults.length === 0
    ? `<p style="font-family:Inter,sans-serif;font-size:14px;color:#6b7280;margin:16px 0;">No Gmail integrations configured.</p>`
    : "";

  const summaryColor = allOk ? "#16a34a" : "#dc2626";
  const summaryText = allOk
    ? "All integrations are connected and working."
    : `${failCount} integration${failCount > 1 ? "s" : ""} need${failCount === 1 ? "s" : ""} attention.`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;">
  <div style="max-width:700px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <!-- Header -->
    <div style="background:#1f2937;padding:28px 32px;">
      <p style="margin:0;font-family:Inter,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#9ca3af;">Top Tier Transitions</p>
      <h1 style="margin:6px 0 0;font-family:Georgia,serif;font-size:22px;font-weight:400;color:#fff;">Daily Integration Health Report</h1>
      <p style="margin:6px 0 0;font-family:Inter,sans-serif;font-size:13px;color:#9ca3af;">${checkedAt} CST</p>
    </div>

    <!-- Summary banner -->
    <div style="background:${allOk ? "#f0fdf4" : "#fef2f2"};border-left:4px solid ${summaryColor};padding:16px 32px;">
      <p style="margin:0;font-family:Inter,sans-serif;font-size:14px;font-weight:600;color:${summaryColor};">${summaryText}</p>
    </div>

    <div style="padding:28px 32px;">

      <!-- Calendar Integration -->
      <h2 style="font-family:Georgia,serif;font-size:17px;font-weight:400;color:#1f2937;margin:0 0 16px;">Google Calendar</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 16px;text-align:left;font-family:Inter,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Account</th>
            <th style="padding:10px 16px;text-align:left;font-family:Inter,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Status</th>
            <th style="padding:10px 16px;text-align:left;font-family:Inter,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:12px 16px;font-family:Inter,sans-serif;font-size:14px;color:#1f2937;">${calResult.email}</td>
            <td style="padding:12px 16px;">${statusBadge(calResult.ok)}</td>
            <td style="padding:12px 16px;font-family:Inter,sans-serif;font-size:13px;color:#dc2626;">${calResult.error || ""}</td>
          </tr>
        </tbody>
      </table>

      <!-- Gmail Integrations -->
      <h2 style="font-family:Georgia,serif;font-size:17px;font-weight:400;color:#1f2937;margin:28px 0 16px;">Gmail / CRM Integrations</h2>
      ${noGmailMsg}
      ${gmailResults.length > 0 ? `
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 16px;text-align:left;font-family:Inter,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Staff Member</th>
            <th style="padding:10px 16px;text-align:left;font-family:Inter,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Gmail Account</th>
            <th style="padding:10px 16px;text-align:left;font-family:Inter,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Status</th>
            <th style="padding:10px 16px;text-align:left;font-family:Inter,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Action Required</th>
          </tr>
        </thead>
        <tbody>${gmailRows}</tbody>
      </table>` : ""}

      <!-- QuickBooks Integration -->
      <h2 style="font-family:Georgia,serif;font-size:17px;font-weight:400;color:#1f2937;margin:28px 0 16px;">QuickBooks Online</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 16px;text-align:left;font-family:Inter,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Company</th>
            <th style="padding:10px 16px;text-align:left;font-family:Inter,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Realm ID</th>
            <th style="padding:10px 16px;text-align:left;font-family:Inter,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Status</th>
            <th style="padding:10px 16px;text-align:left;font-family:Inter,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:12px 16px;font-family:Inter,sans-serif;font-size:14px;color:#1f2937;">${qboResult.companyName || "—"}</td>
            <td style="padding:12px 16px;font-family:Inter,sans-serif;font-size:13px;color:#6b7280;">${qboResult.realmId || "—"}</td>
            <td style="padding:12px 16px;">${statusBadge(qboResult.ok)}${qboResult.wasRefreshed ? `<br><span style="color:#6b7280;font-size:11px;">Token proactively refreshed</span>` : ""}</td>
            <td style="padding:12px 16px;font-family:Inter,sans-serif;font-size:13px;color:#dc2626;">${qboResult.error || ""}</td>
          </tr>
        </tbody>
      </table>

      <!-- Square Integration -->
      <h2 style="font-family:Georgia,serif;font-size:17px;font-weight:400;color:#1f2937;margin:28px 0 16px;">Square (POS / ProFoundFinds)</h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 16px;text-align:left;font-family:Inter,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Location</th>
            <th style="padding:10px 16px;text-align:left;font-family:Inter,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Status</th>
            <th style="padding:10px 16px;text-align:left;font-family:Inter,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:12px 16px;font-family:Inter,sans-serif;font-size:14px;color:#1f2937;">${squareResult.locationName || "—"}</td>
            <td style="padding:12px 16px;">${statusBadge(squareResult.ok)}</td>
            <td style="padding:12px 16px;font-family:Inter,sans-serif;font-size:13px;color:#dc2626;">${squareResult.error || ""}</td>
          </tr>
        </tbody>
      </table>

      <!-- Reconnect Instructions -->
      ${failCount > 0 ? `
      <div style="margin-top:24px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px 20px;">
        <p style="margin:0 0 8px;font-family:Inter,sans-serif;font-size:13px;font-weight:600;color:#92400e;">How to reconnect a broken integration:</p>
        <ul style="margin:0;padding-left:20px;font-family:Inter,sans-serif;font-size:13px;color:#78350f;line-height:1.7;">
          <li><strong>Calendar:</strong> Go to <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin/calendar-auth" style="color:#92400e;">/admin/calendar-auth</a> and complete the OAuth flow</li>
          <li><strong>Gmail:</strong> The affected staff member should go to their profile page and click "Connect Gmail"</li>
          <li><strong>QuickBooks:</strong> Go to <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin/invoicing" style="color:#92400e;">/admin/invoicing</a> and click "Connect QuickBooks"</li>
          <li><strong>Square:</strong> Verify <code>SQUARE_ACCESS_TOKEN</code>, <code>SQUARE_LOCATION_ID</code>, and <code>SQUARE_WEBHOOK_SIGNATURE_KEY</code> are set correctly in Vercel environment variables</li>
        </ul>
      </div>` : ""}

      <!-- Stability Note -->
      <div style="margin-top:24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;">
        <p style="margin:0 0 6px;font-family:Inter,sans-serif;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">About This Report</p>
        <p style="margin:0;font-family:Inter,sans-serif;font-size:13px;color:#64748b;line-height:1.6;">
          This check runs daily at 6AM CST. Gmail tokens expiring within 8 hours are proactively refreshed automatically.
          QBO tokens are proactively refreshed every 6 hours by the token keepalive job.
          If you see frequent disconnections, the Google OAuth app may need to be verified/published in Google Cloud Console
          (unverified apps are limited to 7-day refresh tokens).
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;border-top:1px solid #e5e7eb;background:#f9fafb;">
      <p style="margin:0;font-family:Inter,sans-serif;font-size:12px;color:#9ca3af;">Rightsize by Top Tier Transitions · Automated integration monitoring</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Route Handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Vercel cron jobs send Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Guard: only run within ±10 min of 6 AM Chicago time.
  // Vercel crons can fire a minute or two early/late, so an exact hour comparison
  // (which was "5" instead of "6" at 10:59 UTC) silently skips the email.
  // Using formatToParts avoids locale-specific string quirks (e.g. "06" vs "6").
  const now = new Date();
  const chicagoParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const chicagoH = parseInt(chicagoParts.find(p => p.type === "hour")?.value ?? "0", 10);
  const chicagoM = parseInt(chicagoParts.find(p => p.type === "minute")?.value ?? "0", 10);
  const chicagoMins = chicagoH * 60 + chicagoM; // minutes since midnight
  // Accept 5:50 AM–6:10 AM (350–370 min) — wide enough for cron drift,
  // narrow enough that the 12:00 UTC cron (7 AM CDT / 6 AM CST) can't also fire.
  if (chicagoMins < 350 || chicagoMins > 370) {
    return NextResponse.json({ skipped: true, reason: `Not near 6 AM CST/CDT (Chicago time: ${chicagoH}:${String(chicagoM).padStart(2, "0")})` });
  }

  try {
    // Gather staff info for display names and TTTAdmin emails
    const staffMembers = await getStaffMembers();
    const staffByClerkId = new Map(
      staffMembers.map((s) => [s.clerkUserId, { displayName: s.displayName, email: s.email }])
    );

    const adminEmails = staffMembers
      .filter((s) => s.role === "TTTAdmin" && s.isActive && s.email)
      .map((s) => s.email);

    // Also include env-var TTTAdmin IDs (bootstrap admins may not be in StaffRoles)
    const envAdminIds = (process.env.TTT_ADMIN_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
    for (const id of envAdminIds) {
      const staff = staffByClerkId.get(id);
      if (staff?.email && !adminEmails.includes(staff.email)) {
        adminEmails.push(staff.email);
      }
    }

    if (adminEmails.length === 0) {
      console.warn("[integration-health] No TTTAdmin emails found — skipping email send");
    }

    // Run checks in parallel
    const [calResult, gmailResults, qboResult, squareResult] = await Promise.all([
      checkCalendarIntegration(),
      checkAndRefreshGmailTokens(staffByClerkId, staffMembers),
      checkQuickBooksIntegration(),
      checkSquareIntegration(),
    ]);

    // Supplement admin email lookup with Gmail token emails for env-var admins
    // whose Clerk ID may not be in the StaffRoles table (bootstrap admins).
    if (adminEmails.length === 0 || envAdminIds.length > adminEmails.length) {
      const gmailEmailByClerkId = new Map(gmailResults.map((r) => [r.clerkUserId, r.email]));
      for (const id of envAdminIds) {
        const tokenEmail = gmailEmailByClerkId.get(id);
        if (tokenEmail && !adminEmails.includes(tokenEmail)) {
          adminEmails.push(tokenEmail);
        }
      }
    }

    // Build and send email
    const now = new Date();
    const checkedAt = now.toLocaleString("en-US", {
      timeZone: "America/Chicago",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const allOk = calResult.ok && gmailResults.every((r) => r.ok) && qboResult.ok && squareResult.ok;
    const subject = allOk
      ? `✓ Integrations OK — ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : `⚠ Integration Alert — ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

    const html = buildHealthEmail(calResult, gmailResults, qboResult, squareResult, checkedAt);

    if (adminEmails.length > 0) {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL
        ? `Rightsize <${process.env.RESEND_FROM_EMAIL}>`
        : "Rightsize <hello@rightsize.app>",
        to: adminEmails,
        subject,
        html,
      });
    }

    const summary = {
      calendar: { ok: calResult.ok, error: calResult.error },
      gmail: gmailResults.map((r) => ({ displayName: r.displayName, ok: r.ok, wasRefreshed: r.wasRefreshed, error: r.error })),
      quickbooks: { ok: qboResult.ok, companyName: qboResult.companyName, wasRefreshed: qboResult.wasRefreshed, error: qboResult.error },
      square: { ok: squareResult.ok, locationName: squareResult.locationName, error: squareResult.error },
      emailsSentTo: adminEmails,
      allOk,
    };

    console.log("[integration-health]", JSON.stringify(summary));
    return NextResponse.json({ success: true, ...summary });
  } catch (e) {
    console.error("[integration-health] Fatal error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Health check failed" }, { status: 500 });
  }
}
