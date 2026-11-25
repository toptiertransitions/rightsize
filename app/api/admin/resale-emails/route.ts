import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSystemRole, getTenantById, getStaffMember } from "@/lib/airtable";
import { isResaleEmailType, RESALE_EMAIL_LABEL } from "@/lib/resale-emails/render";
import { renderForProject, sendResaleEmail } from "@/lib/resale-emails/engine";
import { getResaleLog, getResaleState, setAnchor, setPaused } from "@/lib/resale-emails/store";

// Admin controls for the resale update emails (see lib/resale-emails/engine.ts).
//   GET  ?tenantId=&type=      the email as it would render today (HTML)
//   GET  ?tenantId=            the project's anchor, pause flag and send log
//   POST { action, tenantId }  pause | unpause | setAnchor (day) |
//                              sendNow (type, once only) | resend (type, any time)
export const maxDuration = 60;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^rec[A-Za-z0-9]{14}$/;

async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const role = await getSystemRole(userId).catch(() => null);
  if (role !== "TTTAdmin") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { userId };
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  const tenantId = req.nextUrl.searchParams.get("tenantId") ?? "";
  if (!ID_RE.test(tenantId)) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });
  const tenant = await getTenantById(tenantId);
  if (!tenant) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const [state, log] = await Promise.all([getResaleState(tenantId), getResaleLog(tenantId)]);

  const type = req.nextUrl.searchParams.get("type");
  if (type) {
    if (!isResaleEmailType(type)) return NextResponse.json({ error: "Unknown email type" }, { status: 400 });
    const email = await renderForProject(tenant, type, { state, log, trigger: `Preview of ${RESALE_EMAIL_LABEL[type]}` });
    if ("error" in email) return NextResponse.json({ error: email.error }, { status: 422 });
    return NextResponse.json({ subject: email.subject, html: email.html, flags: email.flags, anchor: email.anchor, anchorSource: email.anchorSource });
  }
  return NextResponse.json({ state, log });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  const body = await req.json().catch(() => null) as { action?: string; tenantId?: string; type?: string; day?: string } | null;
  const tenantId = body?.tenantId ?? "";
  if (!ID_RE.test(tenantId)) return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });
  const staff = await getStaffMember(gate.userId).catch(() => null);
  const who = staff?.displayName || gate.userId;

  switch (body?.action) {
    case "pause":
    case "unpause":
      await setPaused(tenantId, body.action === "pause");
      console.log(`[resale-emails] ${body.action} tenant=${tenantId} by=${who}`);
      return NextResponse.json({ ok: true, state: await getResaleState(tenantId) });

    case "setAnchor": {
      if (!body.day || !DAY_RE.test(body.day)) return NextResponse.json({ error: "Pick a date" }, { status: 400 });
      const state = await setAnchor(await getResaleState(tenantId), body.day, "manual", `set by ${who}`);
      return NextResponse.json({ ok: true, state });
    }

    case "sendNow":
    case "resend": {
      if (!isResaleEmailType(body.type)) return NextResponse.json({ error: "Unknown email type" }, { status: 400 });
      const resend = body.action === "resend";
      const outcome = await sendResaleEmail({
        tenantId,
        type: body.type,
        trigger: resend
          ? `Manual resend by ${who}`
          : `Sent now by ${who}${body.type === "hands-on" ? " (invoice sent outside Rightsize, e.g. QuickBooks)" : ""}`,
        once: !resend,
        live: true,
        manualResend: resend,
        triggeredBy: who,
      });
      const status = outcome.status === "failed" ? 502 : outcome.status === "skipped" ? 422 : 200;
      return NextResponse.json(outcome, { status });
    }
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
