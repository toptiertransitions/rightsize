// Resale update emails: decides which email is due for a project, renders it
// and sends it to TTT Admins and TTT Managers (never the client) as a
// ready-to-forward draft, logging every send, skip and dry run in
// ResaleEmailLog. Server only.
//
//   Hands-on complete  when a Full invoice is emailed from Rightsize (or an
//                      Admin clicks "Send hands-on complete email now")
//   Day 30 / 60 / 90   anchor + 30 / 60 / 90 days, from the daily cron
//
// Each email goes out once per project (Admins can resend on purpose).
// Milestones that came due before RESALE_LAUNCH_DATE are marked
// "skipped-before-launch" and never sent. Until RESALE_EMAILS_LIVE=1 the
// automatic triggers only log a dry run (the daily run writes nothing at
// all, the invoice hook logs a dry-run row); the Admin buttons always send.
import { Resend } from "resend";
import {
  getAdminAndManagerStaffEmails,
  getAllLocalVendors,
  getClientContactById,
  getInvoiceSettings,
  getItemSaleEventsForTenant,
  getItemsForTenant,
  getListedProFoundFindsItems,
  getOpportunitiesForTenant,
  getTenantById,
  getTenants,
} from "@/lib/airtable";
import { getAdminEmails } from "@/lib/admin-notifications";
import { addDays, chicagoToday } from "@/lib/pricing/autoDrop";
import { chicagoDay, isExcludedProject } from "@/lib/consignment-status-report";
import type { Tenant } from "@/lib/types";
import { buildResaleData, computeAnchor, SIGNED_AS } from "./data";
import { DAY_EMAILS, DAY_OFFSET, RESALE_EMAIL_LABEL, RESALE_EMAIL_ORDER, renderResaleEmail, type ResaleEmailType } from "./render";
import {
  createLogRow,
  DONE_STATUSES,
  getResaleLog,
  getResaleState,
  getResaleStates,
  setAnchor,
  updateLogRow,
  type ResaleLogRow,
  type ResaleProjectState,
} from "./store";

/** Day emails due before this date are skipped, never sent. */
export const RESALE_LAUNCH_DATE = "2026-11-26";
export const isResaleLive = () => process.env.RESALE_EMAILS_LIVE === "1";
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.toptiertransitions.com").trim();
const FROM = "Top Tier Transitions <noreply@toptiertransitions.com>";

const keyFor = (tenantId: string, type: ResaleEmailType) => `${tenantId}:${type}`;
const isDone = (log: ResaleLogRow[], type: ResaleEmailType) =>
  log.some((r) => r.emailType === type && DONE_STATUSES.includes(r.status));

/** The day "sold since last" counts from: when the previous email in the
 * sequence went out, the day it was due if it was skipped, or the anchor. */
function sinceDayFor(type: ResaleEmailType, log: ResaleLogRow[], anchor: string): string {
  const idx = RESALE_EMAIL_ORDER.indexOf(type);
  for (let i = idx - 1; i >= 0; i--) {
    const prev = RESALE_EMAIL_ORDER[i];
    const rows = log.filter((r) => r.emailType === prev);
    const sent = rows.filter((r) => r.status === "sent" && r.sentAt).map((r) => chicagoDay(new Date(r.sentAt!))).sort().pop();
    if (sent) return sent;
    if (prev !== "hands-on" && rows.some((r) => r.status === "skipped-before-launch")) return addDays(anchor, DAY_OFFSET[prev]);
  }
  return anchor;
}

async function getRecipients(): Promise<string[]> {
  const [staff, admins] = await Promise.all([getAdminAndManagerStaffEmails(), getAdminEmails().catch(() => [] as string[])]);
  const seen = new Map<string, string>();
  for (const e of [...staff, ...admins]) if (e && !seen.has(e.toLowerCase())) seen.set(e.toLowerCase(), e);
  return [...seen.values()];
}

async function contactNameFor(tenantId: string): Promise<string | undefined> {
  const opps = await getOpportunitiesForTenant(tenantId).catch(() => []);
  const won = opps.filter((o) => o.stage === "Won").sort((a, b) => (b.wonAt ?? "").localeCompare(a.wonAt ?? ""))[0];
  if (!won?.clientContactId) return undefined;
  return (await getClientContactById(won.clientContactId).catch(() => null))?.name || undefined;
}

export interface RenderedResaleEmail {
  type: ResaleEmailType;
  subject: string;
  html: string;
  flags: string[];
  anchor: string;
  anchorSource: string;
}

/** Renders one email for a project from live data. Writes nothing. */
export async function renderForProject(
  tenant: Tenant,
  type: ResaleEmailType,
  opts: { state: ResaleProjectState; log: ResaleLogRow[]; trigger: string; anchorOverride?: string }
): Promise<RenderedResaleEmail | { error: string }> {
  const [items, saleEvents, localVendors, settings, contactName] = await Promise.all([
    getItemsForTenant(tenant.id),
    getItemSaleEventsForTenant(tenant.id).catch(() => []),
    getAllLocalVendors().catch(() => []),
    getInvoiceSettings().catch(() => null),
    contactNameFor(tenant.id),
  ]);
  const anchor = opts.anchorOverride ?? opts.state.anchorDate ?? computeAnchor(items);
  if (!anchor) return { error: "No anchor date: the project has no Listed ProFound Finds Consignment items with a delivery date" };
  const anchorSource = opts.state.anchorDate ? (opts.state.anchorSource ?? "computed") : "computed, not yet locked";

  const data = buildResaleData({
    type, tenant, items, saleEvents, localVendors, contactName,
    companyPhone: settings?.companyPhone || undefined,
    anchor,
    sinceDay: sinceDayFor(type, opts.log, anchor),
    appUrl: APP_URL,
  });
  const flags = [...data.flags];
  if (opts.state.anchorSource === "manual") flags.push("Anchor date was set manually by an Admin");
  const clientName = contactName?.trim() || tenant.name;
  const { subject, html } = renderResaleEmail(type, data.merge, {
    projectName: tenant.name,
    clientName,
    clientEmail: tenant.clientEmail ?? "",
    signedAs: SIGNED_AS,
    trigger: opts.trigger,
    anchorDate: anchor,
    anchorSource,
    flags,
    projectUrl: data.projectUrl,
    salesUrl: data.salesUrl,
  });
  return { type, subject, html, flags, anchor, anchorSource };
}

export type SendOutcome =
  | { status: "sent"; logId: string; recipients: string[] }
  | { status: "dry-run"; logId?: string; subject: string }
  | { status: "already-sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

/** Renders, claims and sends one email. `once` enforces one per project. */
export async function sendResaleEmail(params: {
  tenantId: string;
  type: ResaleEmailType;
  trigger: string;
  once: boolean;
  live: boolean;
  manualResend?: boolean;
  triggeredBy?: string;
  invoiceId?: string;
}): Promise<SendOutcome> {
  const { tenantId, type } = params;
  const tenant = await getTenantById(tenantId);
  if (!tenant) return { status: "failed", reason: "Project not found" };
  const [state, log] = await Promise.all([getResaleState(tenantId), getResaleLog(tenantId)]);
  if (params.once && isDone(log, type)) return { status: "already-sent" };

  const base = {
    key: params.manualResend ? `${keyFor(tenantId, type)}:resend:${Date.now()}` : keyFor(tenantId, type),
    tenantId, projectName: tenant.name, emailType: type, trigger: params.trigger,
    manualResend: params.manualResend ?? false, triggeredBy: params.triggeredBy, invoiceId: params.invoiceId,
  };

  // The anchor is locked the first time it is computed
  let lockedState = state;
  if (!state.anchorDate && params.live) {
    const items = await getItemsForTenant(tenantId);
    const computed = computeAnchor(items);
    if (computed) lockedState = await setAnchor(state, computed, "computed", `first computed for ${RESALE_EMAIL_LABEL[type]}`);
  }

  const email = await renderForProject(tenant, type, { state: lockedState, log, trigger: params.trigger });
  if ("error" in email) {
    await createLogRow({ ...base, status: "skipped", reason: email.error }).catch((e) => console.error("[resale-emails] log failed:", e));
    console.log(`[resale-emails] skip tenant=${tenantId} type=${type}: ${email.error}`);
    return { status: "skipped", reason: email.error };
  }

  if (!params.live) {
    // One dry-run row per email per project, so the daily rehearsal doesn't pile up
    const exists = log.some((r) => r.emailType === type && r.status === "dry-run");
    const row = exists ? undefined : await createLogRow({
      ...base, status: "dry-run", anchorDate: email.anchor, flags: email.flags,
      reason: `Dry run (RESALE_EMAILS_LIVE is off): ${email.subject}`,
    });
    console.log(`[resale-emails] dry-run tenant=${tenantId} type=${type} subject="${email.subject}"`);
    return { status: "dry-run", logId: row?.id, subject: email.subject };
  }

  let recipients: string[];
  try {
    recipients = await getRecipients();
  } catch (e) {
    return { status: "failed", reason: e instanceof Error ? e.message : "Recipient lookup failed" };
  }
  if (recipients.length === 0) return { status: "failed", reason: "No active TTT Admins or Managers with an email" };

  // Claim before sending, then make sure no other run claimed it first
  const claim = await createLogRow({ ...base, status: "claimed", anchorDate: email.anchor, flags: email.flags, recipients });
  if (params.once) {
    const rows = (await getResaleLog(tenantId)).filter((r) => r.emailType === type && DONE_STATUSES.includes(r.status));
    if (rows[0] && rows[0].id !== claim.id) {
      await updateLogRow(claim.id, { status: "duplicate", reason: `Already claimed by ${rows[0].id}` });
      return { status: "already-sent" };
    }
  }

  try {
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: FROM, to: recipients, subject: email.subject, html: email.html });
    if (error) throw new Error(error.message || "Resend error");
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Send failed";
    await updateLogRow(claim.id, { status: "failed", reason });
    console.error(`[resale-emails] send failed tenant=${tenantId} type=${type}: ${reason}`);
    return { status: "failed", reason };
  }
  await updateLogRow(claim.id, { status: "sent", sentAt: new Date().toISOString(), reason: email.subject });
  console.log(`[resale-emails] sent tenant=${tenantId} type=${type} to=${recipients.length} trigger="${params.trigger}"`);
  return { status: "sent", logId: claim.id, recipients };
}

/** Invoice hook: a Full invoice was just emailed to the client from Rightsize. */
export async function onFullInvoiceEmailed(invoice: { id: string; tenantId: string; invoiceNumber: string }): Promise<SendOutcome> {
  const log = await getResaleLog(invoice.tenantId);
  if (isDone(log, "hands-on")) return { status: "already-sent" };
  // A re-sent invoice on a project already past Day 30 shouldn't restart the sequence
  if (DAY_EMAILS.some((t) => isDone(log, t))) {
    return { status: "skipped", reason: "Day emails already under way for this project" };
  }
  return sendResaleEmail({
    tenantId: invoice.tenantId,
    type: "hands-on",
    trigger: `Full invoice ${invoice.invoiceNumber} emailed to the client from Rightsize`,
    once: true,
    live: isResaleLive(),
    invoiceId: invoice.id,
  });
}

export interface DailyAction {
  tenantId: string;
  project: string;
  action: string;
  type?: ResaleEmailType;
  due?: string;
}

/** The daily run. `preview` reports what would happen and writes nothing. */
export async function runResaleEmails(opts: { preview: boolean; today?: string }): Promise<{ today: string; live: boolean; actions: DailyAction[] }> {
  const today = opts.today ?? chicagoToday();
  const live = isResaleLive() && !opts.preview;
  // Until RESALE_EMAILS_LIVE=1 the daily run is a pure dry run: it locks no
  // anchors and marks nothing skipped, so going live starts from a clean slate
  if (!live) opts = { ...opts, preview: true };
  const [tenants, states, listed, log] = await Promise.all([
    getTenants(),
    getResaleStates(),
    getListedProFoundFindsItems(),
    getResaleLog(),
  ]);
  const listedByTenant = new Map<string, typeof listed>();
  for (const i of listed) listedByTenant.set(i.tenantId, [...(listedByTenant.get(i.tenantId) ?? []), i]);

  const actions: DailyAction[] = [];
  const projects = tenants.filter((t) =>
    !t.isArchived && !t.isLostDeal && !isExcludedProject(t.name) && (listedByTenant.has(t.id) || states.get(t.id)?.anchorDate)
  );

  for (const tenant of projects) {
    const act = (action: string, type?: ResaleEmailType, due?: string) =>
      actions.push({ tenantId: tenant.id, project: tenant.name, action, type, due });
    try {
      let state: ResaleProjectState = states.get(tenant.id) ?? { tenantId: tenant.id, anchorLog: "", paused: false };
      if (state.paused) { act("paused"); continue; }

      let anchor = state.anchorDate;
      if (!anchor) {
        const computed = computeAnchor(listedByTenant.get(tenant.id) ?? []);
        if (!computed) { act("skipped: no Listed ProFound Finds item with a delivery date"); continue; }
        if (!opts.preview) state = await setAnchor(state, computed, "computed", "daily run");
        anchor = computed;
        act(`anchor ${opts.preview ? "would lock" : "locked"} at ${computed}`);
      }

      const mine = log.filter((r) => r.tenantId === tenant.id);
      for (const type of DAY_EMAILS) {
        if (isDone(mine, type)) continue;
        const due = addDays(anchor, DAY_OFFSET[type]);
        if (due < RESALE_LAUNCH_DATE) {
          if (!opts.preview) {
            await createLogRow({
              key: keyFor(tenant.id, type), tenantId: tenant.id, projectName: tenant.name, emailType: type,
              status: "skipped-before-launch", trigger: "Daily run", anchorDate: anchor,
              reason: `Due ${due}, before the ${RESALE_LAUNCH_DATE} launch`,
            });
          }
          act("skipped before launch", type, due);
          continue;
        }
        if (due > today) { act("next", type, due); break; }

        // Due (or overdue): send this one only, so a backlog goes out in order
        if (opts.preview) { act(live ? "would send" : "would dry-run", type, due); break; }
        const outcome = await sendResaleEmail({ tenantId: tenant.id, type, trigger: `Daily run: ${RESALE_EMAIL_LABEL[type]} due ${due}`, once: true, live });
        act(outcome.status === "skipped" || outcome.status === "failed" ? `${outcome.status}: ${outcome.reason}` : outcome.status, type, due);
        break;
      }
    } catch (e) {
      console.error(`[resale-emails] tenant=${tenant.id} failed:`, e);
      act(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`[resale-emails] run today=${today} live=${live} preview=${opts.preview} projects=${projects.length} ` +
    JSON.stringify(actions.filter((a) => a.action !== "next" && a.action !== "paused")));
  return { today, live, actions };
}
