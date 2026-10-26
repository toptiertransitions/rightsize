// Shared handler for the Plan page "Email Me" routes. TTTAdmin/TTTManager
// only (checked here, not just by hiding buttons). The recipient is always
// the signed-in user's own primary email; the request body never names one.
import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { getSystemRole } from "@/lib/airtable";
import { buildMoversPdf } from "@/lib/movers-pdf-build";
import { loadPlanEmailContext, type PlanEmailContext } from "./context";
import { buildMoverQuoteEmail } from "./mover-quote";
import { buildTeamBriefEmail } from "./team-brief";
import { buildClientMoveWeekEmail } from "./client-move-week";

export type PlanEmailType = "mover-quote" | "team-brief" | "client-move-week";

const BUILDERS: Record<PlanEmailType, (ctx: PlanEmailContext) => { subject: string; html: string; text: string }> = {
  "mover-quote": buildMoverQuoteEmail,
  "team-brief": buildTeamBriefEmail,
  "client-move-week": buildClientMoveWeekEmail,
};

export async function handlePlanEmail(req: NextRequest, type: PlanEmailType) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTAdmin" && sysRole !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { tenantId, confirmEmpty, preview } = body as { tenantId?: string; confirmEmpty?: boolean; preview?: boolean };
  if (!tenantId || !/^rec[A-Za-z0-9]{14}$/.test(tenantId)) {
    return NextResponse.json({ error: "Missing project" }, { status: 400 });
  }

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId).catch(() => null);
  const email = clerkUser?.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress
    ?? clerkUser?.emailAddresses[0]?.emailAddress;
  if (!email) return NextResponse.json({ error: "Could not determine your email" }, { status: 400 });
  const name = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || email;

  const ctx = await loadPlanEmailContext(tenantId, { clerkUserId: userId, name, email });
  if (!ctx) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (type === "mover-quote" && ctx.toBeMovedItems.length === 0 && !confirmEmpty && !preview) {
    return NextResponse.json({ needsConfirm: true, toBeMovedCount: 0 }, { status: 409 });
  }

  const built = BUILDERS[type](ctx);

  // Dev-only dry run: return the rendered email instead of sending it
  if (preview && process.env.NODE_ENV === "development") {
    return NextResponse.json({ ...built, to: email, toBeMovedCount: ctx.toBeMovedItems.length });
  }

  const attachments: { filename: string; content: Buffer }[] = [];
  if (type === "mover-quote" && ctx.toBeMovedItems.length > 0) {
    const pdf = await buildMoversPdf({ items: ctx.toBeMovedItems, tenant: ctx.tenant, settings: ctx.settings });
    attachments.push({ filename: `${ctx.clientName.replace(/[\\/:*?"<>|]/g, "").trim()} - Mover Inventory.pdf`, content: pdf });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: "Top Tier Transitions <noreply@toptiertransitions.com>",
    to: email,
    subject: built.subject,
    html: built.html,
    text: built.text,
    ...(attachments.length ? { attachments } : {}),
  });
  if (error) {
    console.error(`[plan-email-me] ${type} send failed`, error);
    return NextResponse.json({ error: "Email failed to send" }, { status: 502 });
  }

  console.log(`[plan-email-me] ${type} tenant=${tenantId} to=${email} items=${ctx.toBeMovedItems.length}`);
  return NextResponse.json({ ok: true, email });
}
