export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { Resend } from "resend";
import {
  getSystemRole,
  getReferralContactById,
  getReferralCompanyById,
  getTenantById,
  getPlanEntriesForTenant,
} from "@/lib/airtable";
import { getPartnerProjectsByStage } from "@/lib/partner";
import { buildPartnerActiveUpdateEmail } from "@/lib/email";
import type { PlanEntry } from "@/lib/types";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (!["TTTAdmin", "TTTManager", "TTTSales"].includes(sysRole ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { referralContactId } = await req.json();
  if (!referralContactId) return NextResponse.json({ error: "Missing referralContactId" }, { status: 400 });

  const contact = await getReferralContactById(referralContactId).catch(() => null);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  // Send to the logged-in TTT user who clicked the button
  const clerk = await clerkClient();
  const senderUser = await clerk.users.getUser(userId).catch(() => null);
  const toEmail = senderUser?.emailAddresses?.[0]?.emailAddress;
  if (!toEmail) return NextResponse.json({ error: "Could not determine sender email" }, { status: 400 });
  const sentByName = [senderUser?.firstName, senderUser?.lastName].filter(Boolean).join(" ") || undefined;

  const companyId = contact.referralCompanyId || null;
  const company = companyId ? await getReferralCompanyById(companyId).catch(() => null) : null;
  const companyName = company?.name || contact.name;
  const contactFirstName = contact.name.split(" ")[0];

  // Get all referred projects, filter to active (Won, not archived, not consignment-only)
  const projectsByStage = await getPartnerProjectsByStage(contact).catch(() => []);
  const activeEntries = projectsByStage.filter(p => p.stage === "Won" && p.tenantId !== null);

  const enriched = await Promise.all(
    activeEntries.map(async ({ tenantId }) => {
      const [tenant, entries] = await Promise.all([
        getTenantById(tenantId!).catch(() => null),
        getPlanEntriesForTenant(tenantId!).catch(() => [] as PlanEntry[]),
      ]);
      if (!tenant || tenant.isArchived || tenant.isConsignmentOnly) return null;
      return { tenant, entries };
    })
  );

  const projects = enriched
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map(({ tenant, entries }) => {
      // Key dates — one row per entry
      const keyDates = entries
        .filter(e => e.entryType === "keydate")
        .map(e => ({ date: e.date, label: e.activity, isKeyDate: true as const }));

      // Service shifts — group by date so multiple activities on the same day collapse to one row
      const focusByDate = new Map<string, string[]>();
      for (const e of entries.filter(e => e.entryType !== "keydate")) {
        const acts = focusByDate.get(e.date) ?? [];
        if (!acts.includes(e.activity)) acts.push(e.activity);
        focusByDate.set(e.date, acts);
      }
      const focusDays = Array.from(focusByDate.entries()).map(([date, acts]) => ({
        date,
        label: acts.join(" · "),
        isKeyDate: false as const,
      }));

      const timeline = [...keyDates, ...focusDays].sort((a, b) => a.date.localeCompare(b.date));

      return {
        name: tenant.name,
        city: tenant.city,
        state: tenant.state,
        timeline,
      };
    });

  const sentDate = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const html = buildPartnerActiveUpdateEmail({
    contactFirstName,
    companyName,
    projects,
    sentByName,
    sentDate,
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "hello@rightsize.app";

  await resend.emails.send({
    from: `Top Tier Transitions <${fromEmail}>`,
    to: toEmail,
    subject: `Active Project Update — ${companyName}`,
    html,
  });

  return NextResponse.json({ ok: true });
}
