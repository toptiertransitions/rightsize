import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSystemRole } from "@/lib/airtable";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

type BucketRow = Record<string, number | string>;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getSystemRole(userId);
  if (role !== "TTTAdmin" && role !== "TTTManager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    period, filterSummary, kpis,
    revData, oppsCreatedData, oppsWonData, oppsLostData,
    actData, activePartnersData, itemSalesData,
    lostReasons, activityTypes, channels,
  } = body as {
    period: string;
    filterSummary: string;
    kpis: {
      totalSigned: number; totalEarned: number; totalHours: number;
      totalActivities: number; activePartners: number;
      oppsCreated: number; oppsCreatedValue: number;
      oppsWon: number; oppsWonValue: number; oppsLost: number;
      itemsSold: number; totalItemRevenue: number; totalCompanyTake: number;
    };
    revData: BucketRow[];
    oppsCreatedData: BucketRow[];
    oppsWonData: BucketRow[];
    oppsLostData: BucketRow[];
    actData: BucketRow[];
    activePartnersData: BucketRow[];
    itemSalesData: BucketRow[];
    lostReasons: string[];
    activityTypes: string[];
    channels: string[];
  };

  const winRate = kpis.oppsWon + kpis.oppsLost > 0
    ? `${Math.round(kpis.oppsWon / (kpis.oppsWon + kpis.oppsLost) * 100)}%`
    : "n/a";

  const revLines = revData.map(r =>
    `  ${r.label}: Signed=${fmt$(r.Signed as number)}, Earned=${fmt$(r.Earned as number)}`
  ).join("\n");

  const oppsCreatedLines = oppsCreatedData.map(r =>
    `  ${r.label}: ${r.Count} opps, ${fmt$(r["Est. Value"] as number)}`
  ).join("\n");

  const oppsWonLines = oppsWonData.map(r =>
    `  ${r.label}: ${r.Count} won, ${fmt$(r["Est. Value"] as number)}`
  ).join("\n");

  const oppsLostSection = lostReasons.length > 0
    ? `OPPORTUNITIES LOST BY REASON:\n` + oppsLostData
        .map(r => {
          const parts = lostReasons
            .map(reason => `${reason}=${r[reason] ?? 0}`)
            .filter(s => !s.endsWith("=0"));
          return parts.length ? `  ${r.label}: ${parts.join(", ")}` : null;
        })
        .filter(Boolean)
        .join("\n")
    : "";

  const actLines = actData.slice(-6).map(r => {
    const types = activityTypes
      .map(t => `${t}=${r[t] ?? 0}`)
      .filter(s => !s.endsWith("=0"))
      .join(", ");
    return `  ${r.label}: ${types || "none"}`;
  }).join("\n");

  const partnerLines = activePartnersData.map(r =>
    `  ${r.label}: ${r["Active Partners"]} partners`
  ).join("\n");

  const itemLines = itemSalesData.slice(-6).map(r => {
    const chRevs = channels
      .map(ch => `${ch}=${fmt$(r[`rev_${ch}`] as number ?? 0)}`)
      .filter(s => !s.endsWith("=$0"))
      .join(", ");
    return `  ${r.label}: ${chRevs || "none"}`;
  }).join("\n");

  const prompt = `You are a sharp business analyst reviewing performance data for Top Tier Transitions (TTT), a senior downsizing and estate transitions company in the Chicago area. TTT helps families downsize by cataloging, routing, and selling household items. Revenue has two streams: (1) service contracts — signed upfront, earned/invoiced as work is completed; (2) item sales — consignment and direct sales via Facebook Marketplace, eBay, estate sales, ProFound Finds storefront, Square, and Stripe. TTT has a referral partner network (realtors, senior advisors, financial planners) who refer clients. The CRM tracks opportunities through a pipeline.

CURRENT VIEW: ${period} periods${filterSummary ? ` | Filters: ${filterSummary}` : " | No filters (all data)"}

KPI TOTALS (all shown periods combined):
- Signed Contract Value: ${fmt$(kpis.totalSigned)}
- Earned/Invoiced Revenue: ${fmt$(kpis.totalEarned)}
- Hours Logged: ${Math.round(kpis.totalHours / 60)}h
- CRM Activities Logged: ${kpis.totalActivities}
- Unique Active Referral Partners: ${kpis.activePartners}
- Opportunities Created: ${kpis.oppsCreated} (${fmt$(kpis.oppsCreatedValue)} total est. value)
- Opportunities Won: ${kpis.oppsWon} (${fmt$(kpis.oppsWonValue)} total value)
- Opportunities Lost: ${kpis.oppsLost} | Win Rate: ${winRate}
- Items Sold: ${kpis.itemsSold} | Item Revenue: ${fmt$(kpis.totalItemRevenue)} | Company Take: ${fmt$(kpis.totalCompanyTake)}

REVENUE TREND (Signed vs Earned per ${period.toLowerCase()} period):
${revLines}

OPPORTUNITIES CREATED (Count | Est. Value per period):
${oppsCreatedLines}

OPPORTUNITIES WON (Count | Value per period):
${oppsWonLines}

${oppsLostSection}

CRM ACTIVITY BY TYPE (most recent 6 periods):
${actLines}

ACTIVE REFERRAL PARTNERS PER PERIOD:
${partnerLines}

ITEM SALES REVENUE BY CHANNEL (most recent 6 periods):
${itemLines}

Identify 3-5 specific, actionable insights about this data. Look for: directional trends (growth/decline/acceleration), gaps between signed contracts and earned revenue (revenue timing), pipeline health (win rate, conversion speed, lost reasons), referral partner engagement patterns, item sales channel shifts, and hours-vs-revenue efficiency. Flag anything that warrants investigation if the root cause isn't obvious.

Each insight must be 1-2 tight sentences. Be direct and specific — name the metric, the direction, and what to look into. Do not hedge or be vague.

Return ONLY a valid JSON array of strings, no markdown, no explanation:
["Insight one.", "Insight two.", ...]`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "[]";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let insights: string[];
  try {
    insights = JSON.parse(cleaned);
    if (!Array.isArray(insights)) insights = [String(insights)];
  } catch {
    insights = [cleaned];
  }

  return NextResponse.json({ insights });
}
