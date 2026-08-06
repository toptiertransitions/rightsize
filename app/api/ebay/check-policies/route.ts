import { NextResponse } from "next/server";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";
import { auth } from "@clerk/nextjs/server";
import { isTTTAdmin } from "@/lib/config";

function nodeGet(url: string, token: string): Promise<{ ok: boolean; status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = httpsRequest(
      {
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        method:   "GET",
        headers:  { "Authorization": `Bearer ${token}` },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          resolve({ ok: status >= 200 && status < 300, status, body: Buffer.concat(chunks).toString("utf8") });
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function nodePost(url: string, headers: Record<string, string>, body: string): Promise<{ ok: boolean; status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const bodyBuf = Buffer.from(body, "utf8");
    const req = httpsRequest(
      {
        hostname: parsed.hostname,
        path:     parsed.pathname,
        method:   "POST",
        headers:  { ...headers, "content-length": String(bodyBuf.length) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          resolve({ ok: status >= 200 && status < 300, status, body: Buffer.concat(chunks).toString("utf8") });
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.write(bodyBuf);
    req.end();
  });
}

export async function GET() {
  const { userId } = await auth();
  if (!userId || !isTTTAdmin(userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clientId     = process.env.EBAY_CLIENT_ID!;
  const clientSecret = process.env.EBAY_CLIENT_SECRET!;
  const refreshToken = process.env.EBAY_REFRESH_TOKEN!;
  const configuredPolicyId = process.env.EBAY_FULFILLMENT_POLICY_ID ?? "(not set)";

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await nodePost(
    "https://api.ebay.com/identity/v1/oauth2/token",
    {
      "Authorization": `Basic ${credentials}`,
      "Content-Type":  "application/x-www-form-urlencoded",
    },
    new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: refreshToken,
      scope:         [
        "https://api.ebay.com/oauth/api_scope/sell.inventory",
        "https://api.ebay.com/oauth/api_scope/sell.account",
      ].join(" "),
    }).toString()
  );

  if (!tokenRes.ok) {
    return NextResponse.json({ error: `Token error (${tokenRes.status}): ${tokenRes.body}` }, { status: 500 });
  }

  const { access_token } = JSON.parse(tokenRes.body) as { access_token: string };

  // Fetch all fulfillment policies for this account
  const policiesRes = await nodeGet(
    "https://api.ebay.com/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US",
    access_token
  );

  interface ShippingService {
    shippingServiceCode?: string;
    shippingCostType?: string;
    buyerResponsibleForShipping?: boolean;
  }

  interface ShippingOption {
    optionType?: string;
    costType?: string;
    shippingServices?: ShippingService[];
  }

  interface FulfillmentPolicy {
    fulfillmentPolicyId?: string;
    name?: string;
    shippingOptions?: ShippingOption[];
    globalShipping?: boolean;
    pickupDropOff?: boolean;
    freightShipping?: boolean;
    description?: string;
  }

  let policies: FulfillmentPolicy[] = [];
  if (policiesRes.ok) {
    const data = JSON.parse(policiesRes.body) as { fulfillmentPolicies?: FulfillmentPolicy[] };
    policies = data.fulfillmentPolicies ?? [];
  }

  // Summarize each policy clearly
  const summary = policies.map(p => ({
    id:              p.fulfillmentPolicyId,
    name:            p.name,
    isConfiguredId:  p.fulfillmentPolicyId === configuredPolicyId,
    shippingOptions: (p.shippingOptions ?? []).map(opt => ({
      type:     opt.optionType,
      costType: opt.costType,
      services: (opt.shippingServices ?? []).map(s => ({
        code:       s.shippingServiceCode,
        calculated: s.buyerResponsibleForShipping ?? (opt.costType === "CALCULATED"),
      })),
    })),
  }));

  return NextResponse.json({
    configuredPolicyId,
    totalPolicies: policies.length,
    policies: summary,
    rawPoliciesStatus: policiesRes.status,
    ...(policiesRes.ok ? {} : { rawError: policiesRes.body }),
  });
}
