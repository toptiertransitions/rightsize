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

  // Fetch all three policy types in parallel
  const [fulfillmentRes, paymentRes, returnRes] = await Promise.all([
    nodeGet("https://api.ebay.com/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US", access_token),
    nodeGet("https://api.ebay.com/sell/account/v1/payment_policy?marketplace_id=EBAY_US", access_token),
    nodeGet("https://api.ebay.com/sell/account/v1/return_policy?marketplace_id=EBAY_US", access_token),
  ]);

  function pickId(res: { ok: boolean; body: string }, key: string) {
    if (!res.ok) return [];
    const data = JSON.parse(res.body) as Record<string, { name?: string; [k: string]: unknown }[]>;
    return (data[key] ?? []).map((p) => ({
      id:   (p as Record<string, string>)[key.replace(/s$/, "Id").replace("fulfillmentPolic", "fulfillmentPolicyI").replace("paymentPolic", "paymentPolicyI").replace("returnPolic", "returnPolicyI")] ?? (p as Record<string, string>)[Object.keys(p).find(k => k.endsWith("Id")) ?? ""],
      name: p.name,
    }));
  }

  // Parse each list simply
  function parseList(res: { ok: boolean; status: number; body: string }, listKey: string, idKey: string) {
    if (!res.ok) return { error: res.body.slice(0, 200), status: res.status };
    const data = JSON.parse(res.body) as Record<string, Record<string, string>[]>;
    return (data[listKey] ?? []).map(p => ({ id: p[idKey], name: p.name }));
  }

  const configured = {
    EBAY_FULFILLMENT_POLICY_ID: process.env.EBAY_FULFILLMENT_POLICY_ID ?? "(not set)",
    EBAY_PAYMENT_POLICY_ID:     process.env.EBAY_PAYMENT_POLICY_ID     ?? "(not set)",
    EBAY_RETURN_POLICY_ID:      process.env.EBAY_RETURN_POLICY_ID      ?? "(not set)",
    EBAY_MERCHANT_LOCATION_KEY: process.env.EBAY_MERCHANT_LOCATION_KEY ?? "(not set — defaults to TTT_CHICAGO)",
  };

  return NextResponse.json({
    configured,
    fulfillmentPolicies: parseList(fulfillmentRes, "fulfillmentPolicies", "fulfillmentPolicyId"),
    paymentPolicies:     parseList(paymentRes,     "paymentPolicies",     "paymentPolicyId"),
    returnPolicies:      parseList(returnRes,       "returnPolicies",      "returnPolicyId"),
  });

  void pickId; // suppress unused warning
}
