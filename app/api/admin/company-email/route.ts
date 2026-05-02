import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import {
  getSystemRole,
  getStaffMembers,
  getTenants,
  getContractsForTenant,
  getOpportunities,
  getClientContacts,
  getAllActivities,
  getAllItems,
} from "@/lib/airtable";
import type { Tenant, Contract } from "@/lib/types";

const resend = new Resend(process.env.RESEND_API_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function sevenDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split("T")[0];
}

async function fetchAllContracts(
  tenants: Tenant[]
): Promise<{ tenantId: string; contracts: Contract[] }[]> {
  const results = await Promise.allSettled(
    tenants.map(async (t) => ({
      tenantId: t.id,
      contracts: await getContractsForTenant(t.id).catch(() => [] as Contract[]),
    }))
  );
  return results
    .filter(
      (r): r is PromiseFulfilledResult<{ tenantId: string; contracts: Contract[] }> =>
        r.status === "fulfilled"
    )
    .map((r) => r.value);
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sysRole = await getSystemRole(userId).catch(() => null);
  if (sysRole !== "TTTAdmin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { announcementsText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { announcementsText = "" } = body;

  // Resolve sender's email to use as recipient (they review + forward)
  let recipientEmail = "";
  try {
    const clerk = await clerkClient();
    const user = await clerk.users.getUser(userId);
    recipientEmail =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
        ?.emailAddress ||
      user.emailAddresses[0]?.emailAddress ||
      "";
  } catch { /* fallback below */ }
  if (!recipientEmail)
    return NextResponse.json({ error: "Could not resolve sender email" }, { status: 500 });

  const ago = sevenDaysAgo();

  // Fetch all data in parallel
  const [allStaff, tenants, opps, contacts, allActivities, allItems] =
    await Promise.all([
      getStaffMembers().catch(() => []),
      getTenants().catch(() => []),
      getOpportunities().catch(() => []),
      getClientContacts().catch(() => []),
      getAllActivities().catch(() => []),
      getAllItems().catch(() => []),
    ]);

  const clientTenants = tenants.filter((t) => t.isTTT !== false);
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));
  const contractResults = await fetchAllContracts(clientTenants);

  // ── New staff (last 7 days) ──────────────────────────────────────────────────
  const newStaff = allStaff.filter(
    (s) =>
      s.isActive &&
      s.createdAt?.slice(0, 10) >= ago &&
      ["TTTStaff", "TTTManager", "TTTSales"].includes(s.role)
  );

  const newStaffWithImages = await Promise.all(
    newStaff.map(async (s) => {
      let imageUrl = "";
      try {
        const clerk = await clerkClient();
        const user = await clerk.users.getUser(s.clerkUserId);
        imageUrl = user.imageUrl || "";
      } catch { /* non-fatal */ }
      const parts = s.displayName.trim().split(/\s+/);
      const firstName = parts[0] || s.displayName;
      const lastInitial = parts.length > 1 ? `${parts[parts.length - 1][0]}.` : "";
      return { ...s, imageUrl, firstName, lastInitial };
    })
  );

  // ── New signed projects (last 7 days) ────────────────────────────────────────
  const newProjects: { clientName: string; city: string }[] = [];
  for (const { tenantId, contracts } of contractResults) {
    const tenant = tenantMap.get(tenantId);
    if (!tenant) continue;
    const hasSigned = contracts.some(
      (c) => c.status === "Signed" && c.signedAt && c.signedAt.slice(0, 10) >= ago
    );
    if (hasSigned) {
      newProjects.push({
        clientName: tenant.name,
        city: [tenant.city, tenant.state].filter(Boolean).join(", "),
      });
    }
  }

  // ── CRM pipeline (active leads) ──────────────────────────────────────────────
  const ACTIVE_STAGES = new Set(["Lead", "Qualifying", "Proposing"]);
  const contactMap = new Map(contacts.map((c) => [c.id, c]));
  const pipelineItems = opps
    .filter((o) => ACTIVE_STAGES.has(o.stage))
    .map((o) => ({
      name:
        o.keyPeople?.[0]?.name ||
        contactMap.get(o.clientContactId)?.name ||
        "—",
      city: o.city || "—",
    }));

  // ── Weekly CRM activity — unique contacts ────────────────────────────────────
  const oppContactMap = new Map(opps.map((o) => [o.id, o.clientContactId]));
  const weekActivities = allActivities.filter(
    (a) => a.activityDate && a.activityDate.slice(0, 10) >= ago
  );
  const uniqueContactsThisWeek = new Set(
    weekActivities
      .map((a) => a.clientContactId || oppContactMap.get(a.opportunityId) || "")
      .filter(Boolean)
  );

  // ── Sold & donated last 7 days ───────────────────────────────────────────────
  const recentSold = allItems.filter(
    (i) => i.status === "Sold" && i.completedDate && i.completedDate.slice(0, 10) >= ago
  );
  const recentDonated = allItems.filter(
    (i) => i.status === "Donated" && i.completedDate && i.completedDate.slice(0, 10) >= ago
  );
  const soldCount = recentSold.length;
  const soldValue = recentSold.reduce((s, i) => s + (i.salePrice || i.valueMid || 0), 0);
  const donatedCount = recentDonated.length;

  // ── AI: format announcements as bullets ──────────────────────────────────────
  let announcementBullets: string[] = [];
  if (announcementsText.trim()) {
    try {
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `You are writing internal company announcements for Top Tier Transitions LLC — a senior move management and estate transition company. Convert the following raw notes into 3–6 clean, clear, warm, and encouraging bullet points appropriate for a weekly internal team email. Each bullet should be complete in itself. Return ONLY the bullet points, one per line, starting each line with a • character. No intro, no headers, no other text.\n\nNotes:\n${announcementsText}`,
          },
        ],
      });
      const text = msg.content[0].type === "text" ? msg.content[0].text : "";
      announcementBullets = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("•") || l.startsWith("-"))
        .map((l) => l.replace(/^[•\-]\s*/, "").trim())
        .filter(Boolean);
    } catch { /* non-fatal — fall back to raw text */ }
  }

  // ── Email date helpers ───────────────────────────────────────────────────────
  const reportDate = new Date().toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 6);
  const weekRangeLabel = `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  // ── Color palette ────────────────────────────────────────────────────────────
  const SAGE = "#2d4a3e";
  const TINT = "#f0f4f0";
  const DARK = "#1a1a1a";
  const MUTED = "#6b7280";

  // ── Section helper ───────────────────────────────────────────────────────────
  function section(title: string, content: string): string {
    return `
    <tr><td style="padding:0 32px;"><div style="height:1px;background:#e5e7eb;"></div></td></tr>
    <tr>
      <td style="padding:24px 32px;">
        <p style="margin:0 0 16px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.9px;">${title}</p>
        ${content}
      </td>
    </tr>`;
  }

  // ── Section: Weekly Announcements ────────────────────────────────────────────
  const announcementsContent =
    announcementBullets.length > 0
      ? `<table width="100%" cellpadding="0" cellspacing="0">
          ${announcementBullets
            .map(
              (b) => `<tr>
            <td style="padding:5px 0;vertical-align:top;width:20px;">
              <div style="width:6px;height:6px;background:${SAGE};border-radius:50%;margin-top:7px;"></div>
            </td>
            <td style="padding:5px 0 5px 10px;font-size:14px;color:${DARK};line-height:1.65;">${b}</td>
          </tr>`
            )
            .join("")}
        </table>`
      : announcementsText.trim()
      ? `<p style="margin:0;font-size:14px;color:${DARK};line-height:1.7;">${announcementsText.replace(/\n/g, "<br/>")}</p>`
      : `<p style="margin:0;font-size:13px;color:#9ca3af;font-style:italic;">No announcements this week.</p>`;

  // ── Section: Our People ───────────────────────────────────────────────────────
  const ourPeopleContent =
    newStaffWithImages.length === 0
      ? `<p style="margin:0;font-size:13px;color:#9ca3af;font-style:italic;">No new team members this week.</p>`
      : `<table cellpadding="0" cellspacing="0"><tr>
          ${newStaffWithImages
            .map(
              (s) => `<td style="padding-right:24px;text-align:center;vertical-align:top;">
            ${
              s.imageUrl
                ? `<img src="${s.imageUrl}" alt="${s.firstName}" width="60" height="60" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:2px solid #c8d8c8;display:block;margin:0 auto 8px;" />`
                : `<table cellpadding="0" cellspacing="0" style="margin:0 auto 8px;"><tr><td style="width:60px;height:60px;border-radius:50%;background:${TINT};border:2px solid #c8d8c8;text-align:center;vertical-align:middle;"><span style="font-size:22px;font-weight:700;color:${SAGE};">${s.firstName[0] || "?"}</span></td></tr></table>`
            }
            <p style="margin:0;font-size:13px;font-weight:700;color:${DARK};">${s.firstName} ${s.lastInitial}</p>
            <p style="margin:2px 0 0;font-size:11px;color:${MUTED};">${s.role.replace("TTT", "")}</p>
          </td>`
            )
            .join("")}
        </tr></table>`;

  // ── Section: New Projects ─────────────────────────────────────────────────────
  const newProjectsContent =
    newProjects.length === 0
      ? `<p style="margin:0;font-size:13px;color:#9ca3af;font-style:italic;">No new signed contracts this week.</p>`
      : `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
          <thead><tr>
            <th style="padding:8px 14px;font-size:10px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:.6px;background:#f9fafb;border-bottom:1px solid #e5e7eb;text-align:left;">Client</th>
            <th style="padding:8px 14px;font-size:10px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:.6px;background:#f9fafb;border-bottom:1px solid #e5e7eb;text-align:left;">Location</th>
          </tr></thead>
          <tbody>
          ${newProjects
            .map(
              (p, i) => `<tr style="background:${i % 2 === 0 ? "#fff" : TINT};">
              <td style="padding:10px 14px;font-size:14px;font-weight:600;color:${DARK};border-bottom:1px solid #f3f4f6;">${p.clientName}</td>
              <td style="padding:10px 14px;font-size:13px;color:${MUTED};border-bottom:1px solid #f3f4f6;">${p.city || "—"}</td>
            </tr>`
            )
            .join("")}
          </tbody>
        </table>`;

  // ── Section: Sales & Future Projects ─────────────────────────────────────────
  const salesContent = `
    ${
      pipelineItems.length === 0
        ? `<p style="margin:0 0 18px;font-size:13px;color:#9ca3af;font-style:italic;">No active pipeline.</p>`
        : `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:18px;">
            <thead><tr>
              <th style="padding:8px 14px;font-size:10px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:.6px;background:#f9fafb;border-bottom:1px solid #e5e7eb;text-align:left;">Opportunity</th>
              <th style="padding:8px 14px;font-size:10px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:.6px;background:#f9fafb;border-bottom:1px solid #e5e7eb;text-align:left;">Town</th>
            </tr></thead>
            <tbody>
            ${pipelineItems
              .map(
                (p, i) => `<tr style="background:${i % 2 === 0 ? "#fff" : TINT};">
                <td style="padding:10px 14px;font-size:13px;color:${DARK};border-bottom:1px solid #f3f4f6;">${p.name}</td>
                <td style="padding:10px 14px;font-size:13px;color:${MUTED};border-bottom:1px solid #f3f4f6;">${p.city}</td>
              </tr>`
              )
              .join("")}
            </tbody>
          </table>`
    }
    <table cellpadding="0" cellspacing="0" style="background:${TINT};border:1.5px solid #c8d8c8;border-radius:10px;">
      <tr><td style="padding:16px 22px;">
        <p style="margin:0 0 2px;font-size:10px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:.5px;">Unique Contacts Touched &mdash; ${weekRangeLabel}</p>
        <p style="margin:0;font-size:30px;font-weight:800;color:${SAGE};line-height:1.1;">${uniqueContactsThisWeek.size}</p>
        <p style="margin:4px 0 0;font-size:12px;color:${MUTED};">${weekActivities.length} total activities across the team</p>
      </td></tr>
    </table>`;

  // ── Section: Rehoming Our Clients' Treasures ─────────────────────────────────
  const rehomingContent = `
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="49%" style="padding-right:8px;vertical-align:top;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:12px;">
          <tr><td style="padding:18px 20px;">
            <p style="margin:0 0 2px;font-size:10px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:.5px;">Items Found New Homes</p>
            <p style="margin:0;font-size:36px;font-weight:800;color:#059669;line-height:1.1;">${soldCount}</p>
            <p style="margin:8px 0 0;font-size:15px;font-weight:700;color:${DARK};">${fmtMoney(soldValue)}</p>
            <p style="margin:2px 0 0;font-size:11px;color:${MUTED};">total sale value</p>
            <p style="margin:6px 0 0;font-size:11px;color:${MUTED};">${weekRangeLabel}</p>
          </td></tr>
        </table>
      </td>
      <td width="49%" style="padding-left:8px;vertical-align:top;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:12px;">
          <tr><td style="padding:18px 20px;">
            <p style="margin:0 0 2px;font-size:10px;font-weight:700;color:#ea580c;text-transform:uppercase;letter-spacing:.5px;">Items Donated</p>
            <p style="margin:0;font-size:36px;font-weight:800;color:#ea580c;line-height:1.1;">${donatedCount}</p>
            <p style="margin:8px 0 0;font-size:15px;font-weight:600;color:${DARK};">Meaningful contributions</p>
            <p style="margin:2px 0 0;font-size:11px;color:${MUTED};">to local organizations</p>
            <p style="margin:6px 0 0;font-size:11px;color:${MUTED};">${weekRangeLabel}</p>
          </td></tr>
        </table>
      </td>
    </tr></table>`;

  // ── Assemble HTML ─────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Weekly Company Update &mdash; Top Tier Transitions</title>
</head>
<body style="margin:0;padding:0;background:#f2f2f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f2;padding:28px 16px;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">

  <!-- Header -->
  <tr>
    <td style="background:${SAGE};padding:28px 32px 24px;">
      <p style="margin:0;font-size:11px;font-weight:700;color:#a8d4bc;text-transform:uppercase;letter-spacing:2px;">Top Tier Transitions</p>
      <p style="margin:6px 0 0;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Weekly Company Update</p>
      <p style="margin:8px 0 0;font-size:13px;color:#a8d4bc;">${reportDate}</p>
    </td>
  </tr>

  ${section("Weekly Announcements", announcementsContent)}
  ${section("Our People" + (newStaffWithImages.length > 0 ? ` &mdash; Welcome Aboard!` : ""), ourPeopleContent)}
  ${section(`New Projects &mdash; ${weekRangeLabel}`, newProjectsContent)}
  ${section("Sales &amp; Future Projects", salesContent)}
  ${section("Rehoming Our Clients&#39; Treasures", rehomingContent)}

  <!-- Footer -->
  <tr><td style="padding:0 32px;"><div style="height:1px;background:#e5e7eb;"></div></td></tr>
  <tr>
    <td style="background:${SAGE};padding:16px 32px;">
      <p style="margin:0;font-size:12px;color:#a8d4bc;text-align:center;line-height:1.8;">
        ${reportDate} &nbsp;&middot;&nbsp; Top Tier Transitions &nbsp;&middot;&nbsp; (312) 600-3016
      </p>
      <p style="margin:4px 0 0;font-size:11px;color:#7ab89a;text-align:center;">For internal team distribution only. Review and forward as needed.</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  await resend.emails.send({
    from: "Top Tier Transitions <noreply@toptiertransitions.com>",
    to: recipientEmail,
    subject: `Weekly Company Update — ${reportDate}`,
    html,
  });

  return NextResponse.json({ success: true, sentTo: recipientEmail });
}
